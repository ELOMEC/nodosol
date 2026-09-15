//! Private-pricing resale (commit/reveal) coverage — Phase 3 P2-008.
//!
//! Listing seller commits a `keccak256(price ‖ nonce)` hash on-chain;
//! buyer reveals the (price, nonce) pair to claim the listing. This
//! suite covers the happy path + the auditor-flagged sad paths from
//! the threat model TM-3 family.

mod common;

use common::{
    buy_ticket_ix, buy_ticket_resale_private_ix, create_event_ix, initialize_event_tree_ix,
    list_ticket_resale_ix, list_ticket_resale_private_ix, make_create_merkle_tree_account_ix,
    private_price_commit, resale_pda, BuyTicketAccounts, BuyTicketResaleAccounts, Fixture,
    ListTicketResaleAccounts, TreeMirror, MERKLE_TREE_ACCOUNT_SIZE, START_UNIX,
};
use mpl_bubblegum::types::LeafSchema;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

const EVENT_ID: u64 = 333;
const PRICE: u64 = 10_000_000;
const CAPACITY: u64 = 50;
const EVENT_NAME: &str = "Private Resale Test";
const EVENT_SYMBOL: &str = "PRT";
const EVENT_URI: &str = "https://nodosol.com/private-resale.json";

const REVEAL_PRICE: u64 = 42_000_000;

/// Boilerplate: seed event + tree + first mint to f.buyer + return
/// fully-mirrored TreeMirror so callers can list+buy from leaf 0.
fn seed_event_tree_and_first_mint(
    f: &mut Fixture,
) -> (Pubkey, Pubkey, Pubkey, Pubkey, TreeMirror, LeafSchema) {
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

/// List the leaf-0 cNFT as a PRIVATE resale with the given commit.
/// Returns the listing PDA + the mirror state with the transfer
/// already mirrored (so leaf 0 now belongs to the listing PDA).
fn list_private(
    f: &mut Fixture,
    event: &Pubkey,
    tree_config: &Pubkey,
    merkle_tree: &Pubkey,
    mirror: &mut TreeMirror,
    leaf: &LeafSchema,
    price_commit: [u8; 32],
    expires_at: i64,
) -> Pubkey {
    let leaf_index: u32 = 0;
    let (nonce, data_hash, creator_hash) = match leaf {
        LeafSchema::V1 {
            nonce,
            data_hash,
            creator_hash,
            ..
        } => (*nonce, *data_hash, *creator_hash),
        _ => panic!(),
    };
    let (listing, _) = resale_pda(merkle_tree, leaf_index, &f.ctx.program_id);
    let proof = mirror.proof_metas(leaf_index);
    let root = mirror.root();

    let ix = list_ticket_resale_private_ix(
        &f.ctx.program_id,
        ListTicketResaleAccounts {
            seller: &f.buyer.pubkey(),
            event,
            listing: &listing,
            tree_config,
            merkle_tree,
        },
        leaf_index,
        nonce,
        root,
        data_hash,
        creator_hash,
        price_commit,
        expires_at,
        &proof,
    );
    f.ctx.send(vec![ix], &f.buyer, &[]).unwrap();
    mirror.mirror_transfer(leaf_index, listing);
    listing
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

#[test]
fn list_private_then_reveal_pays_seller_and_closes_listing() {
    // Full commit/reveal flow: seller commits keccak(price ‖ nonce);
    // buyer reveals matching pair → leaf transfers + payment splits.
    let mut f = Fixture::new_with_fee(250, 50_000_000); // 2.5% royalty
    let (event, _vault, tree_config, merkle_tree, mut mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    let price_nonce = [0xBAu8; 32];
    let commit = private_price_commit(REVEAL_PRICE, &price_nonce);
    let listing = list_private(
        &mut f,
        &event,
        &tree_config,
        &merkle_tree,
        &mut mirror,
        &leaf,
        commit,
        START_UNIX + 7 * 86_400,
    );

    // Spin up second buyer with enough balance.
    let buyer2 = Keypair::new();
    f.ctx.fund(&buyer2.pubkey(), 5_000_000_000);
    let buyer2_ata = f
        .ctx
        .create_ata(&buyer2, &buyer2.pubkey(), &f.payment_mint);
    f.ctx.mint_to(
        &f.payment_mint,
        &buyer2_ata,
        &f.payment_mint_authority,
        100_000_000,
    );

    let seller = f.buyer.pubkey();
    let seller_ata = f.buyer_payment_ata;
    let seller_balance_before = f.ctx.balance(&seller_ata);

    // Pull leaf state from mirror (leaf is now owned by listing PDA).
    let leaf_now = mirror.leaf(0);
    let (data_hash, creator_hash) = match leaf_now {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(0);
    let root = mirror.root();

    let ix = buy_ticket_resale_private_ix(
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
        REVEAL_PRICE,
        price_nonce,
        &proof,
    );
    f.ctx.send(vec![ix], &buyer2, &[]).unwrap();

    // Royalty = 42 × 2.5% = 1.05 USDC; seller gets 40.95 USDC.
    // Treasury already had 250_000 from primary-sale fee on the 10 USDC
    // initial buy. Add 1_050_000 from the resale royalty.
    assert_eq!(f.ctx.balance(&f.treasury), 250_000 + 1_050_000);
    assert_eq!(
        f.ctx.balance(&seller_ata),
        seller_balance_before + 40_950_000
    );
    assert_eq!(
        f.ctx.balance(&buyer2_ata),
        100_000_000 - REVEAL_PRICE
    );
    assert!(
        f.ctx.svm.get_account(&listing).is_none(),
        "listing PDA must close after successful private buy"
    );
}

// ---------------------------------------------------------------------------
// Sad paths
// ---------------------------------------------------------------------------

#[test]
fn list_private_rejects_zero_commit() {
    // The handler explicitly rejects `[0u8; 32]` as a commit so we can
    // distinguish "uninitialised" from "private listing" downstream.
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
    let _ = (event, tree_config); // unused in this sad-path test

    let ix = list_ticket_resale_private_ix(
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
        [0u8; 32],
        START_UNIX + 7 * 86_400,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &f.buyer, &[]);
    assert!(
        result.is_err(),
        "list_private with zero commit must fail (PriceCommitMismatch)"
    );
    assert!(f.ctx.svm.get_account(&listing).is_none());
    let _ = mirror;
}

#[test]
fn buy_private_rejects_when_revealed_price_doesnt_match_commit() {
    // The keccak-binding of price + nonce — reveal a different price
    // and the on-chain check rejects with PriceCommitMismatch.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, _vault, tree_config, merkle_tree, mut mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    let price_nonce = [0xCDu8; 32];
    let commit = private_price_commit(REVEAL_PRICE, &price_nonce);
    let listing = list_private(
        &mut f,
        &event,
        &tree_config,
        &merkle_tree,
        &mut mirror,
        &leaf,
        commit,
        START_UNIX + 7 * 86_400,
    );

    let buyer2 = Keypair::new();
    f.ctx.fund(&buyer2.pubkey(), 5_000_000_000);
    let buyer2_ata = f
        .ctx
        .create_ata(&buyer2, &buyer2.pubkey(), &f.payment_mint);
    f.ctx.mint_to(
        &f.payment_mint,
        &buyer2_ata,
        &f.payment_mint_authority,
        100_000_000,
    );

    let seller = f.buyer.pubkey();
    let seller_ata = f.buyer_payment_ata;

    let leaf_now = mirror.leaf(0);
    let (data_hash, creator_hash) = match leaf_now {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(0);
    let root = mirror.root();

    // Reveal a DIFFERENT price than the commit was made for.
    let bogus_price = REVEAL_PRICE + 1_000_000;
    let ix = buy_ticket_resale_private_ix(
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
        bogus_price,
        price_nonce,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &buyer2, &[]);
    assert!(
        result.is_err(),
        "reveal with wrong price must fail (PriceCommitMismatch)"
    );
    assert!(
        f.ctx.svm.get_account(&listing).is_some(),
        "listing must remain open after failed reveal"
    );
    assert_eq!(f.ctx.balance(&buyer2_ata), 100_000_000);
}

#[test]
fn buy_private_rejects_when_revealed_nonce_doesnt_match_commit() {
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, _vault, tree_config, merkle_tree, mut mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    let true_nonce = [0xEFu8; 32];
    let commit = private_price_commit(REVEAL_PRICE, &true_nonce);
    let listing = list_private(
        &mut f,
        &event,
        &tree_config,
        &merkle_tree,
        &mut mirror,
        &leaf,
        commit,
        START_UNIX + 7 * 86_400,
    );

    let buyer2 = Keypair::new();
    f.ctx.fund(&buyer2.pubkey(), 5_000_000_000);
    let buyer2_ata = f
        .ctx
        .create_ata(&buyer2, &buyer2.pubkey(), &f.payment_mint);
    f.ctx.mint_to(
        &f.payment_mint,
        &buyer2_ata,
        &f.payment_mint_authority,
        100_000_000,
    );

    let seller = f.buyer.pubkey();
    let seller_ata = f.buyer_payment_ata;
    let leaf_now = mirror.leaf(0);
    let (data_hash, creator_hash) = match leaf_now {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(0);
    let root = mirror.root();

    let wrong_nonce = [0xFFu8; 32];
    let ix = buy_ticket_resale_private_ix(
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
        REVEAL_PRICE,
        wrong_nonce,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &buyer2, &[]);
    assert!(
        result.is_err(),
        "reveal with wrong nonce must fail (PriceCommitMismatch)"
    );
    assert!(f.ctx.svm.get_account(&listing).is_some());
}

#[test]
fn buy_private_rejects_when_listing_was_public() {
    // Listings created via the PUBLIC list ix have price_commit == 0.
    // The private buy ix asserts price_commit != 0 (ListingIsPublic
    // gate) — auditor's TM-3 family flag.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, _vault, tree_config, merkle_tree, mut mirror, leaf) =
        seed_event_tree_and_first_mint(&mut f);

    // Use the PUBLIC list ix to create the listing with a plain price
    // (price_commit stays zero in the underlying state).
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
        REVEAL_PRICE,
        START_UNIX + 7 * 86_400,
        &proof,
    );
    f.ctx.send(vec![ix], &f.buyer, &[]).unwrap();
    mirror.mirror_transfer(leaf_index, listing);

    let buyer2 = Keypair::new();
    f.ctx.fund(&buyer2.pubkey(), 5_000_000_000);
    let buyer2_ata = f
        .ctx
        .create_ata(&buyer2, &buyer2.pubkey(), &f.payment_mint);
    f.ctx.mint_to(
        &f.payment_mint,
        &buyer2_ata,
        &f.payment_mint_authority,
        100_000_000,
    );

    let seller = f.buyer.pubkey();
    let seller_ata = f.buyer_payment_ata;
    let leaf_now = mirror.leaf(0);
    let (data_hash2, creator_hash2) = match leaf_now {
        LeafSchema::V1 {
            data_hash,
            creator_hash,
            ..
        } => (*data_hash, *creator_hash),
        _ => panic!(),
    };
    let proof = mirror.proof_metas(0);
    let root = mirror.root();

    // Try the PRIVATE buy ix on the PUBLIC listing — must fail.
    let nonce_bytes = [0u8; 32];
    let ix = buy_ticket_resale_private_ix(
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
        data_hash2,
        creator_hash2,
        REVEAL_PRICE,
        nonce_bytes,
        &proof,
    );
    let result = f.ctx.send(vec![ix], &buyer2, &[]);
    assert!(
        result.is_err(),
        "private buy on public listing must fail (ListingIsPublic)"
    );
}
