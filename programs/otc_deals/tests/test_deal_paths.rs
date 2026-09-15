//! Sad-path coverage for otc_deals — focuses on the gaps from
//! `docs/TEST_GAP_ANALYSIS.md`: expire_deal crank edges +
//! accept_deal/cancel_deal state-machine violations.

mod common;

use common::{
    accept_deal_ix, cancel_deal_ix, expire_deal_ix, propose_deal_ix, AcceptDealAccounts,
    Fixture, ProposeDealAccounts, START_UNIX,
};
use otc_deals::state::DealStatus;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

const DEAL_ID: u64 = 77;
const MEMO: [u8; 32] = [0xABu8; 32];
const QTY: u64 = 5;
const PRICE: u64 = 500_000_000;
const EXPIRES_OFFSET: i64 = 3_600;

fn seed_proposed_deal(f: &mut Fixture) -> (Pubkey, Pubkey) {
    let (deal, _) = f.ctx.deal_pda(&f.seller.pubkey(), &f.buyer.pubkey(), DEAL_ID);
    let (vault, _) = f.ctx.vault_pda(&deal);
    let propose = propose_deal_ix(
        &f.ctx.program_id,
        ProposeDealAccounts {
            seller: &f.seller.pubkey(),
            buyer: &f.buyer.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            deal: &deal,
            vault: &vault,
            seller_asset_account: &f.seller_asset_ata,
            token_program: &f.ctx.token_program,
        },
        DEAL_ID,
        QTY,
        PRICE,
        START_UNIX + EXPIRES_OFFSET,
        MEMO,
    );
    f.ctx.send(propose, &f.seller, &[]).unwrap();
    (deal, vault)
}

// ---------------------------------------------------------------------------
// expire_deal sad paths (permissionless crank — see PERMISSIONLESS_IX_REVIEW)
// ---------------------------------------------------------------------------

#[test]
fn expire_deal_rejects_before_expires_at() {
    // Cranker tries to expire a fresh deal — must fail with DealNotYetExpired.
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (deal, vault) = seed_proposed_deal(&mut f);

    let cranker = Keypair::new();
    f.ctx.fund(&cranker.pubkey(), 1_000_000_000);

    let ix = expire_deal_ix(
        &f.ctx.program_id,
        &cranker.pubkey(),
        &f.seller.pubkey(),
        &f.asset_mint,
        &deal,
        &vault,
        &f.seller_asset_ata,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(ix, &cranker, &[]);
    assert!(
        result.is_err(),
        "expire before expires_at must fail (DealNotYetExpired)"
    );
    // Vault still holds escrow.
    assert_eq!(f.ctx.balance(&vault), QTY);
    let state = f.ctx.get_deal(&deal);
    assert_eq!(state.status, DealStatus::Proposed);
}

#[test]
fn expire_deal_rejects_when_deal_already_accepted() {
    // Buyer accepts deal, then anyone tries to expire it. Status must
    // be Proposed for expire to fire — the now-Accepted deal rejects.
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
    let (deal, vault) = seed_proposed_deal(&mut f);

    let accept = accept_deal_ix(
        &f.ctx.program_id,
        AcceptDealAccounts {
            buyer: &f.buyer.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            deal: &deal,
            vault: &vault,
            buyer_asset_account: &f.buyer_asset_ata,
            buyer_payment_account: &f.buyer_payment_ata,
            seller_payment_account: &f.seller_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
        },
    );
    f.ctx.send(accept, &f.buyer, &[]).unwrap();

    // After accept, deal is Accepted (or vault is closed). Try to expire.
    f.ctx.advance_time(EXPIRES_OFFSET + 1);
    let cranker = Keypair::new();
    f.ctx.fund(&cranker.pubkey(), 1_000_000_000);

    let ix = expire_deal_ix(
        &f.ctx.program_id,
        &cranker.pubkey(),
        &f.seller.pubkey(),
        &f.asset_mint,
        &deal,
        &vault,
        &f.seller_asset_ata,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(ix, &cranker, &[]);
    assert!(
        result.is_err(),
        "expire on accepted deal must fail (DealNotProposed)"
    );
}

// ---------------------------------------------------------------------------
// accept_deal sad paths
// ---------------------------------------------------------------------------

#[test]
fn accept_deal_rejects_after_expiry() {
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
    let (deal, vault) = seed_proposed_deal(&mut f);

    // Skip past expires_at.
    f.ctx.advance_time(EXPIRES_OFFSET + 1);

    let accept = accept_deal_ix(
        &f.ctx.program_id,
        AcceptDealAccounts {
            buyer: &f.buyer.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            deal: &deal,
            vault: &vault,
            buyer_asset_account: &f.buyer_asset_ata,
            buyer_payment_account: &f.buyer_payment_ata,
            seller_payment_account: &f.seller_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
        },
    );
    let result = f.ctx.send(accept, &f.buyer, &[]);
    assert!(
        result.is_err(),
        "accept after expires_at must fail (DealExpired)"
    );
    // Buyer payment unchanged; vault still holds asset escrow.
    assert_eq!(f.ctx.balance(&f.buyer_payment_ata), 1_000_000_000);
    assert_eq!(f.ctx.balance(&vault), QTY);
    let state = f.ctx.get_deal(&deal);
    assert_eq!(state.status, DealStatus::Proposed);
}

#[test]
fn accept_deal_rejects_when_signer_is_not_named_buyer() {
    // Deal PDA is seeded with seller + buyer; an attacker trying to
    // accept gets the wrong PDA derivation.
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
    let (deal, vault) = seed_proposed_deal(&mut f);

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);
    let attacker_asset_ata =
        f.ctx
            .create_ata(&attacker, &attacker.pubkey(), &f.asset_mint);
    let attacker_payment_ata =
        f.ctx
            .create_ata(&attacker, &attacker.pubkey(), &f.payment_mint);
    f.ctx.mint_to(
        &f.payment_mint,
        &attacker_payment_ata,
        &f.payment_mint_authority,
        1_000_000_000,
    );

    let accept = accept_deal_ix(
        &f.ctx.program_id,
        AcceptDealAccounts {
            buyer: &attacker.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            deal: &deal,
            vault: &vault,
            buyer_asset_account: &attacker_asset_ata,
            buyer_payment_account: &attacker_payment_ata,
            seller_payment_account: &f.seller_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
        },
    );
    let result = f.ctx.send(accept, &attacker, &[]);
    assert!(
        result.is_err(),
        "accept by non-named buyer must fail (PDA seeds bind to original buyer)"
    );
    let state = f.ctx.get_deal(&deal);
    assert_eq!(state.status, DealStatus::Proposed);
}

// ---------------------------------------------------------------------------
// cancel_deal sad paths
// ---------------------------------------------------------------------------

#[test]
fn cancel_deal_rejects_after_buyer_accepted() {
    // Seller can't cancel an already-accepted deal.
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
    let (deal, vault) = seed_proposed_deal(&mut f);

    let accept = accept_deal_ix(
        &f.ctx.program_id,
        AcceptDealAccounts {
            buyer: &f.buyer.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            deal: &deal,
            vault: &vault,
            buyer_asset_account: &f.buyer_asset_ata,
            buyer_payment_account: &f.buyer_payment_ata,
            seller_payment_account: &f.seller_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
        },
    );
    f.ctx.send(accept, &f.buyer, &[]).unwrap();

    // Now seller tries to cancel — must fail.
    let cancel = cancel_deal_ix(
        &f.ctx.program_id,
        &f.seller.pubkey(),
        &f.asset_mint,
        &deal,
        &vault,
        &f.seller_asset_ata,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(cancel, &f.seller, &[]);
    assert!(
        result.is_err(),
        "cancel after accept must fail (DealNotProposed or vault closed)"
    );
}

#[test]
fn cancel_deal_rejects_when_signer_is_not_seller() {
    // Attacker tries to cancel someone else's deal — PDA seeds reject.
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (deal, vault) = seed_proposed_deal(&mut f);

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);
    let attacker_asset_ata =
        f.ctx
            .create_ata(&attacker, &attacker.pubkey(), &f.asset_mint);

    let ix = cancel_deal_ix(
        &f.ctx.program_id,
        &attacker.pubkey(),
        &f.asset_mint,
        &deal,
        &vault,
        &attacker_asset_ata,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(ix, &attacker, &[]);
    assert!(
        result.is_err(),
        "cancel by non-seller must fail (PDA seeds bind to original seller)"
    );
    // Vault still holds escrow.
    assert_eq!(f.ctx.balance(&vault), QTY);
    let state = f.ctx.get_deal(&deal);
    assert_eq!(state.status, DealStatus::Proposed);
}
