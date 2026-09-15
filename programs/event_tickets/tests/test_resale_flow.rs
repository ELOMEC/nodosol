mod common;

use common::{
    buy_ticket_ix, buy_ticket_resale_ix, cancel_ticket_resale_ix, close_expired_resale_ix,
    create_event_ix, initialize_event_tree_ix, list_ticket_resale_ix,
    make_create_merkle_tree_account_ix, resale_pda, BuyTicketAccounts, BuyTicketResaleAccounts,
    CancelTicketResaleAccounts, CloseExpiredResaleAccounts, Fixture, ListTicketResaleAccounts,
    TreeMirror, MERKLE_TREE_ACCOUNT_SIZE, START_UNIX,
};
use mpl_bubblegum::types::LeafSchema;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

const EVENT_ID: u64 = 99;
const PRICE: u64 = 10_000_000;
const CAPACITY: u64 = 50;
const EVENT_NAME: &str = "Resale Test";
const EVENT_SYMBOL: &str = "RST";
const EVENT_URI: &str = "https://nodosol.com/resale-test.json";

const RESALE_PRICE: u64 = 25_000_000;

/// Boilerplate: seed event + tree + buy 1 ticket as `f.buyer` and
/// mirror the mint into a fresh `TreeMirror`. Returns the keys callers
/// need to drive resale ix-evi.
fn seed_event_tree_and_first_mint(
    f: &mut Fixture,
) -> (
    Pubkey,
    Pubkey,
    Pubkey,
    Pubkey,
    TreeMirror,
    LeafSchema,
) {
    // create_event
    let (event, _) = f.ctx.event_pda(&f.creator.pubkey(), EVENT_ID);
    let (vault, _) = f.ctx.vault_pda(&event);
    let create = create_event_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &f.payment_mint,
        &event,
        &vault,
        &f.ctx.token_program,
        EVENT_ID,
        PRICE,
        CAPACITY,
        START_UNIX,
        START_UNIX + 86_400,
        EVENT_NAME.into(),
        EVENT_SYMBOL.into(),
        EVENT_URI.into(),
    );
    f.ctx.send(vec![create], &f.creator, &[]).unwrap();

    // initialize_event_tree
    let merkle_tree_kp = Keypair::new();
    let merkle_tree_pk = merkle_tree_kp.pubkey();
    let (tree_config, _) = f.ctx.tree_config_pda(&merkle_tree_pk);
    let rent = f
        .ctx
        .svm
        .minimum_balance_for_rent_exemption(MERKLE_TREE_ACCOUNT_SIZE as usize);
    let create_tree =
        make_create_merkle_tree_account_ix(&f.creator.pubkey(), &merkle_tree_pk, rent);
    let init_tree = initialize_event_tree_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        &tree_config,
        &merkle_tree_pk,
    );
    f.ctx
        .send(vec![create_tree, init_tree], &f.creator, &[&merkle_tree_kp])
        .unwrap();

    // buy_ticket — mints leaf at index 0 to `f.buyer`.
    let buy = buy_ticket_ix(
        &f.ctx.program_id,
        BuyTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree_pk,
        },
    );
    f.ctx.send(vec![buy], &f.buyer, &[]).unwrap();

    // Mirror the mint off-chain so we can generate proofs for resale ix-evi.
    let mut mirror = TreeMirror::new();
    let leaf = mirror.mirror_mint_primary_sale(
        &merkle_tree_pk,
        f.buyer.pubkey(),
        EVENT_NAME,
        EVENT_SYMBOL,
        EVENT_URI,
    );

    (event, vault, tree_config, merkle_tree_pk, mirror, leaf)
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

#[test]
fn list_ticket_resale_transfers_leaf_to_listing_pda() {
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, _vault, tree_config, merkle_tree, mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    let leaf_index: u32 = 0;
    let nonce = match leaf {
        LeafSchema::V1 { nonce, .. } => nonce,
        _ => panic!("unexpected leaf schema"),
    };
    let (data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (data_hash, creator_hash),
        _ => panic!(),
    };

    let (listing, _) = resale_pda(&merkle_tree, leaf_index, &f.ctx.program_id);
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let ix = list_ticket_resale_ix(
        &f.ctx.program_id,
        ListTicketResaleAccounts {
            seller: &f.buyer.pubkey(),
            event: &event,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        leaf_index,
        nonce,
        root,
        data_hash,
        creator_hash,
        RESALE_PRICE,
        START_UNIX + 7 * 86_400,
        &proof,
    );
    f.ctx.send(vec![ix], &f.buyer, &[]).unwrap();

    // Listing PDA exists with seller = buyer + price = RESALE_PRICE.
    let acc = f
        .ctx
        .svm
        .get_account(&listing)
        .expect("listing PDA must be initialised");
    assert!(acc.data.len() > 8, "listing should have non-trivial data");
}

// ---------------------------------------------------------------------------
// Sad paths
// ---------------------------------------------------------------------------

#[test]
fn list_ticket_resale_rejects_when_seller_doesnt_own_leaf() {
    // Mint to `f.buyer`, but try to list as a different seller.
    // Bubblegum's transfer ix verifies ownership via merkle proof —
    // a wrong-seller signer cannot produce a valid proof for leaf 0.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, _vault, tree_config, merkle_tree, mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let leaf_index: u32 = 0;
    let (nonce, data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            nonce,
            data_hash,
            creator_hash,
            ..
        } => (nonce, data_hash, creator_hash),
        _ => panic!(),
    };

    let (listing, _) = resale_pda(&merkle_tree, leaf_index, &f.ctx.program_id);
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let ix = list_ticket_resale_ix(
        &f.ctx.program_id,
        ListTicketResaleAccounts {
            seller: &attacker.pubkey(),
            event: &event,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        leaf_index,
        nonce,
        root,
        data_hash,
        creator_hash,
        RESALE_PRICE,
        START_UNIX + 7 * 86_400,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &attacker, &[]);
    assert!(
        result.is_err(),
        "list with non-owner signer must fail (Bubblegum proof rejects)"
    );
    assert!(
        f.ctx.svm.get_account(&listing).is_none(),
        "listing PDA must NOT be initialised on failure"
    );
}

#[test]
fn list_ticket_resale_rejects_with_zero_price() {
    // Our handler asserts `price > 0` before issuing the Bubblegum CPI;
    // a zero price must fail with InvalidPrice without moving the leaf.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, _vault, tree_config, merkle_tree, mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    let leaf_index: u32 = 0;
    let (nonce, data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            nonce,
            data_hash,
            creator_hash,
            ..
        } => (nonce, data_hash, creator_hash),
        _ => panic!(),
    };

    let (listing, _) = resale_pda(&merkle_tree, leaf_index, &f.ctx.program_id);
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let ix = list_ticket_resale_ix(
        &f.ctx.program_id,
        ListTicketResaleAccounts {
            seller: &f.buyer.pubkey(),
            event: &event,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        leaf_index,
        nonce,
        root,
        data_hash,
        creator_hash,
        0, // zero price → InvalidPrice
        START_UNIX + 7 * 86_400,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &f.buyer, &[]);
    assert!(
        result.is_err(),
        "list with price=0 must fail (InvalidPrice)"
    );
    assert!(f.ctx.svm.get_account(&listing).is_none());
}

#[test]
fn list_ticket_resale_rejects_with_past_expiry() {
    // expires_at < now → InvalidTimeWindow.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, _vault, tree_config, merkle_tree, mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    let leaf_index: u32 = 0;
    let (nonce, data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            nonce,
            data_hash,
            creator_hash,
            ..
        } => (nonce, data_hash, creator_hash),
        _ => panic!(),
    };

    let (listing, _) = resale_pda(&merkle_tree, leaf_index, &f.ctx.program_id);
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    // Set expires_at in the past relative to test clock (which starts at START_UNIX).
    let past_expiry = START_UNIX - 1;
    let ix = list_ticket_resale_ix(
        &f.ctx.program_id,
        ListTicketResaleAccounts {
            seller: &f.buyer.pubkey(),
            event: &event,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        leaf_index,
        nonce,
        root,
        data_hash,
        creator_hash,
        RESALE_PRICE,
        past_expiry,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &f.buyer, &[]);
    assert!(
        result.is_err(),
        "list with past expires_at must fail (InvalidTimeWindow)"
    );
    assert!(f.ctx.svm.get_account(&listing).is_none());
}

// ---------------------------------------------------------------------------
// buy_ticket_resale
// ---------------------------------------------------------------------------

/// Helper: list leaf 0 as resale, return the listing key + the mirror
/// state AFTER the on-chain transfer is reflected. The mirror's root /
/// proof-for-leaf-0 are now what `buy_ticket_resale` needs.
#[allow(clippy::too_many_arguments)]
fn seed_event_and_active_listing(
    f: &mut Fixture,
) -> (Pubkey, Pubkey, Pubkey, Pubkey, TreeMirror, Pubkey) {
    let (event, _vault, tree_config, merkle_tree, mut mirror, leaf) =
        seed_event_tree_and_first_mint(f);
    let leaf_index: u32 = 0;
    let (nonce, data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            nonce,
            data_hash,
            creator_hash,
            ..
        } => (nonce, data_hash, creator_hash),
        _ => panic!(),
    };
    let (listing, _) = resale_pda(&merkle_tree, leaf_index, &f.ctx.program_id);
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();
    let ix = list_ticket_resale_ix(
        &f.ctx.program_id,
        ListTicketResaleAccounts {
            seller: &f.buyer.pubkey(),
            event: &event,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        leaf_index,
        nonce,
        root,
        data_hash,
        creator_hash,
        RESALE_PRICE,
        START_UNIX + 7 * 86_400,
        &proof,
    );
    f.ctx.send(vec![ix], &f.buyer, &[]).unwrap();
    // Mirror the on-chain transfer: leaf now owned by listing PDA.
    mirror.mirror_transfer(leaf_index, listing);

    (event, tree_config, merkle_tree, listing, mirror, f.buyer.pubkey())
}

#[test]
fn buy_ticket_resale_pays_seller_and_treasury_and_closes_listing() {
    // 2.5% royalty, second buyer has 50 USDC for the resale.
    let mut f = Fixture::new_with_fee(250, 50_000_000);
    let (_event, tree_config, merkle_tree, listing, mirror, seller) =
        seed_event_and_active_listing(&mut f);

    // Need a fresh buyer-2 with their own ATA.
    let buyer2 = Keypair::new();
    f.ctx.fund(&buyer2.pubkey(), 5_000_000_000);
    let buyer2_ata = f
        .ctx
        .create_ata(&buyer2, &buyer2.pubkey(), &f.payment_mint);
    f.ctx.mint_to(
        &f.payment_mint,
        &buyer2_ata,
        &f.payment_mint_authority,
        50_000_000,
    );

    // Seller IS the original buyer — reuse f.buyer_payment_ata as
    // the seller payment account (already created by Fixture::new).
    let seller_ata = f.buyer_payment_ata;
    let seller_balance_before = f.ctx.balance(&seller_ata);
    let _ = seller; // already encoded in seller_ata's authority

    // Pull the listing's leaf data from the mirror — at leaf 0 the
    // owner+delegate are now the listing PDA (we mirrored the list transfer).
    let leaf_index: u32 = 0;
    let leaf = mirror.leaf(leaf_index);
    let (data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let ix = buy_ticket_resale_ix(
        &f.ctx.program_id,
        BuyTicketResaleAccounts {
            buyer: &buyer2.pubkey(),
            seller: &seller,
            listing: &listing,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &buyer2_ata,
            seller_payment_account: &seller_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        root,
        data_hash,
        creator_hash,
        &proof,
    );
    f.ctx.send(vec![ix], &buyer2, &[]).unwrap();

    // Royalty = 25 USDC * 2.5% = 0.625 USDC. Seller gets 24.375 USDC
    // ON TOP OF whatever they had (they paid 10 USDC for ticket then
    // received nothing back; their ATA is the same one used for the
    // initial buy_ticket so balance also includes the original purchase).
    // Treasury already has 250_000 from the initial 2.5% on 10 USDC.
    assert_eq!(f.ctx.balance(&f.treasury), 250_000 + 625_000);
    assert_eq!(f.ctx.balance(&seller_ata), seller_balance_before + 24_375_000);
    assert_eq!(f.ctx.balance(&buyer2_ata), 50_000_000 - RESALE_PRICE);

    // Listing PDA closed (rent refunded to seller).
    assert!(
        f.ctx.svm.get_account(&listing).is_none(),
        "listing PDA must be closed after resale fill"
    );
}

#[test]
fn buy_ticket_resale_rejects_when_seller_buys_own_listing() {
    // SellerCannotBuy gate — wash-trade prevention.
    let mut f = Fixture::new_with_fee(250, 50_000_000);
    let (_event, tree_config, merkle_tree, listing, mirror, seller) =
        seed_event_and_active_listing(&mut f);

    // Seller already has an ATA — top up with enough to cover the resale price.
    f.ctx.mint_to(
        &f.payment_mint,
        &f.buyer_payment_ata,
        &f.payment_mint_authority,
        50_000_000,
    );

    let leaf_index: u32 = 0;
    let leaf = mirror.leaf(leaf_index);
    let (data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let bal_before = f.ctx.balance(&f.buyer_payment_ata);

    let ix = buy_ticket_resale_ix(
        &f.ctx.program_id,
        BuyTicketResaleAccounts {
            buyer: &seller,                       // attacker = seller
            seller: &seller,
            listing: &listing,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            seller_payment_account: &f.buyer_payment_ata, // same ata; doesn't matter — ix should reject pre-transfer
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        root,
        data_hash,
        creator_hash,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &f.buyer, &[]);
    assert!(
        result.is_err(),
        "seller buying own listing must fail (SellerCannotBuy)"
    );

    // Listing still active, no fees moved by the failed resale (treasury
    // still holds the 250_000 from the initial primary-sale fee).
    assert!(f.ctx.svm.get_account(&listing).is_some());
    assert_eq!(f.ctx.balance(&f.buyer_payment_ata), bal_before);
    assert_eq!(f.ctx.balance(&f.treasury), 250_000);
}

#[test]
fn list_ticket_resale_rejects_when_wrong_tree_address() {
    // Pass a foreign merkle_tree pubkey — `address = event.merkle_tree`
    // constraint must reject before Bubblegum is even invoked.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, _vault, tree_config, merkle_tree, mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    let leaf_index: u32 = 0;
    let (nonce, data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            nonce,
            data_hash,
            creator_hash,
            ..
        } => (nonce, data_hash, creator_hash),
        _ => panic!(),
    };

    let foreign_tree = Keypair::new().pubkey();
    let (listing, _) = resale_pda(&foreign_tree, leaf_index, &f.ctx.program_id);
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let ix = list_ticket_resale_ix(
        &f.ctx.program_id,
        ListTicketResaleAccounts {
            seller: &f.buyer.pubkey(),
            event: &event,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &foreign_tree,
        },
        leaf_index,
        nonce,
        root,
        data_hash,
        creator_hash,
        RESALE_PRICE,
        START_UNIX + 7 * 86_400,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &f.buyer, &[]);
    assert!(
        result.is_err(),
        "list with wrong merkle_tree must fail (ResaleTreeMismatch / address constraint)"
    );
    let _ = (event, tree_config, merkle_tree); // silence unused — they're listing inputs only
}

// ---------------------------------------------------------------------------
// cancel_ticket_resale
// ---------------------------------------------------------------------------

#[test]
fn cancel_ticket_resale_returns_leaf_to_seller_and_closes_pda() {
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (_event, tree_config, merkle_tree, listing, mirror, seller) =
        seed_event_and_active_listing(&mut f);

    let leaf_index: u32 = 0;
    let leaf = mirror.leaf(leaf_index);
    let (data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let ix = cancel_ticket_resale_ix(
        &f.ctx.program_id,
        CancelTicketResaleAccounts {
            seller: &seller,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        root,
        data_hash,
        creator_hash,
        &proof,
    );
    f.ctx.send(vec![ix], &f.buyer, &[]).unwrap();

    // Listing PDA closed (rent refunded to seller).
    assert!(
        f.ctx.svm.get_account(&listing).is_none(),
        "cancel must close the listing PDA"
    );
}

#[test]
fn cancel_ticket_resale_rejects_when_signer_is_not_seller() {
    // has_one = seller binds the cancel signer to listing.seller; an
    // attacker signing must fail.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (_event, tree_config, merkle_tree, listing, mirror, _seller) =
        seed_event_and_active_listing(&mut f);

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let leaf_index: u32 = 0;
    let leaf = mirror.leaf(leaf_index);
    let (data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let ix = cancel_ticket_resale_ix(
        &f.ctx.program_id,
        CancelTicketResaleAccounts {
            seller: &attacker.pubkey(),
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        root,
        data_hash,
        creator_hash,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &attacker, &[]);
    assert!(
        result.is_err(),
        "cancel by non-seller must fail (has_one = seller)"
    );
    assert!(
        f.ctx.svm.get_account(&listing).is_some(),
        "listing must remain active after rejected cancel"
    );
}

// ---------------------------------------------------------------------------
// close_expired_resale ✦ (permissionless crank)
// ---------------------------------------------------------------------------

#[test]
fn close_expired_resale_rejects_before_expires_at() {
    // expires_at is 7 days in the future per seed_event_and_active_listing;
    // an immediate close attempt must fail with ResaleNotExpired.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (_event, tree_config, merkle_tree, listing, mirror, seller) =
        seed_event_and_active_listing(&mut f);

    let cranker = Keypair::new();
    f.ctx.fund(&cranker.pubkey(), 1_000_000_000);

    let leaf_index: u32 = 0;
    let leaf = mirror.leaf(leaf_index);
    let (data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let ix = close_expired_resale_ix(
        &f.ctx.program_id,
        CloseExpiredResaleAccounts {
            caller: &cranker.pubkey(),
            seller: &seller,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        root,
        data_hash,
        creator_hash,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &cranker, &[]);
    assert!(
        result.is_err(),
        "close_expired_resale before expiry must fail (ResaleNotExpired)"
    );
    assert!(
        f.ctx.svm.get_account(&listing).is_some(),
        "listing must remain active before its expiry"
    );
}

#[test]
fn close_expired_resale_succeeds_when_called_by_third_party_after_expiry() {
    // Permissionless crank — anyone can clean up an expired listing,
    // and the cNFT + rent refund go to the SELLER (not the cranker).
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (_event, tree_config, merkle_tree, listing, mirror, seller) =
        seed_event_and_active_listing(&mut f);

    // Move past the 7-day expiry.
    f.ctx.advance_time(7 * 86_400 + 1);

    let cranker = Keypair::new();
    f.ctx.fund(&cranker.pubkey(), 1_000_000_000);

    let leaf_index: u32 = 0;
    let leaf = mirror.leaf(leaf_index);
    let (data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let listing_lamports_before = f
        .ctx
        .svm
        .get_account(&listing)
        .map(|a| a.lamports)
        .unwrap_or(0);
    let seller_lamports_before = f
        .ctx
        .svm
        .get_account(&seller)
        .map(|a| a.lamports)
        .unwrap_or(0);

    let ix = close_expired_resale_ix(
        &f.ctx.program_id,
        CloseExpiredResaleAccounts {
            caller: &cranker.pubkey(),
            seller: &seller,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        root,
        data_hash,
        creator_hash,
        &proof,
    );
    f.ctx.send(vec![ix], &cranker, &[]).unwrap();

    // Listing PDA closed; rent refunded to seller (not cranker).
    assert!(
        f.ctx.svm.get_account(&listing).is_none(),
        "listing PDA must be closed by close_expired_resale"
    );
    let seller_lamports_after = f
        .ctx
        .svm
        .get_account(&seller)
        .map(|a| a.lamports)
        .unwrap_or(0);
    assert_eq!(
        seller_lamports_after,
        seller_lamports_before + listing_lamports_before,
        "all listing rent must flow to the seller, not the cranker"
    );
}

#[test]
fn close_expired_resale_rejects_when_listing_has_no_expiry() {
    // A listing created with expires_at == 0 (no expiry) cannot be
    // permissionlessly closed — even after time advances arbitrarily.
    // Replicate the list ix path here with expires_at = 0.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (_event, _vault, tree_config, merkle_tree, mut mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    let leaf_index: u32 = 0;
    let (nonce, data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            nonce,
            data_hash,
            creator_hash,
            ..
        } => (nonce, data_hash, creator_hash),
        _ => panic!(),
    };
    let (listing, _) = resale_pda(&merkle_tree, leaf_index, &f.ctx.program_id);
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    // List with expires_at = 0 (no expiry).
    let list = list_ticket_resale_ix(
        &f.ctx.program_id,
        ListTicketResaleAccounts {
            seller: &f.buyer.pubkey(),
            event: &_event,
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        leaf_index,
        nonce,
        root,
        data_hash,
        creator_hash,
        RESALE_PRICE,
        0, // no expiry
        &proof,
    );
    f.ctx.send(vec![list], &f.buyer, &[]).unwrap();
    mirror.mirror_transfer(leaf_index, listing);

    // Skip a year — still must fail because expires_at is 0.
    f.ctx.advance_time(365 * 86_400);

    let cranker = Keypair::new();
    f.ctx.fund(&cranker.pubkey(), 1_000_000_000);

    let leaf = mirror.leaf(leaf_index);
    let (data_hash2, creator_hash2) = match leaf {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let close = close_expired_resale_ix(
        &f.ctx.program_id,
        CloseExpiredResaleAccounts {
            caller: &cranker.pubkey(),
            seller: &f.buyer.pubkey(),
            listing: &listing,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        root,
        data_hash2,
        creator_hash2,
        &proof,
    );
    let result = f.ctx.send(vec![close], &cranker, &[]);
    assert!(
        result.is_err(),
        "close on listing with expires_at=0 must fail (ResaleNotExpired)"
    );
    assert!(
        f.ctx.svm.get_account(&listing).is_some(),
        "listing must remain after the rejected close"
    );
}
