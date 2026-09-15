mod common;

use common::{
    accept_deal_ix, cancel_deal_ix, expire_deal_ix, propose_deal_ix, AcceptDealAccounts, Fixture,
    ProposeDealAccounts, START_UNIX,
};
use otc_deals::state::DealStatus;
use solana_keypair::Keypair;
use solana_signer::Signer;

const DEAL_ID: u64 = 42;
const MEMO: [u8; 32] = [7u8; 32];

fn expiry_from_now(ctx_now: i64, offset_secs: i64) -> i64 {
    ctx_now + offset_secs
}

#[test]
fn propose_and_accept_flows_escrow_and_payment() {
    // fee 3%, seller 10 tokens, buyer 1000 USDC
    let mut f = Fixture::new_with_fee(300, 10, 1_000_000_000);
    let quantity: u64 = 5;
    let total_price: u64 = 500_000_000; // 500 USDC (6 dec)
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
        quantity,
        total_price,
        expiry_from_now(START_UNIX, 3_600), // 1h
        MEMO,
    );
    f.ctx.send(propose, &f.seller, &[]).unwrap();

    assert_eq!(f.ctx.balance(&f.seller_asset_ata), 5);
    assert_eq!(f.ctx.balance(&vault), 5);

    let state = f.ctx.get_deal(&deal);
    assert_eq!(state.status, DealStatus::Proposed);
    assert_eq!(state.quantity, quantity);
    assert_eq!(state.total_price, total_price);
    assert_eq!(state.memo_hash, MEMO);

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

    // 3% of 500 USDC = 15, seller gets 485.
    assert_eq!(f.ctx.balance(&f.treasury), 15_000_000);
    assert_eq!(f.ctx.balance(&f.seller_payment_ata), 485_000_000);
    assert_eq!(f.ctx.balance(&f.buyer_payment_ata), 500_000_000);
    assert_eq!(f.ctx.balance(&f.buyer_asset_ata), 5);
    assert_eq!(f.ctx.balance(&vault), 0);

    assert_eq!(f.ctx.get_deal(&deal).status, DealStatus::Accepted);
}

#[test]
fn propose_rejects_self_deal() {
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (deal, _) = f.ctx.deal_pda(&f.seller.pubkey(), &f.seller.pubkey(), DEAL_ID);
    let (vault, _) = f.ctx.vault_pda(&deal);
    let propose = propose_deal_ix(
        &f.ctx.program_id,
        ProposeDealAccounts {
            seller: &f.seller.pubkey(),
            buyer: &f.seller.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            deal: &deal,
            vault: &vault,
            seller_asset_account: &f.seller_asset_ata,
            token_program: &f.ctx.token_program,
        },
        DEAL_ID,
        1,
        1,
        expiry_from_now(START_UNIX, 3_600),
        MEMO,
    );
    let result = f.ctx.send(propose, &f.seller, &[]);
    assert!(result.is_err());
}

#[test]
fn propose_rejects_invalid_expiry() {
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (deal, _) = f.ctx.deal_pda(&f.seller.pubkey(), &f.buyer.pubkey(), DEAL_ID);
    let (vault, _) = f.ctx.vault_pda(&deal);
    // Below 1 minute window.
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
        1,
        1,
        expiry_from_now(START_UNIX, 30), // 30s, too short
        MEMO,
    );
    assert!(f.ctx.send(propose, &f.seller, &[]).is_err());
}

#[test]
fn accept_rejects_wrong_buyer() {
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
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
        2,
        10_000_000,
        expiry_from_now(START_UNIX, 3_600),
        MEMO,
    );
    f.ctx.send(propose, &f.seller, &[]).unwrap();

    // Impostor tries to accept.
    let impostor = Keypair::new();
    f.ctx.fund(&impostor.pubkey(), 5_000_000_000);
    let impostor_payment_ata = f.ctx.create_ata(&impostor, &impostor.pubkey(), &f.payment_mint);
    f.ctx.mint_to(&f.payment_mint, &impostor_payment_ata, &f.payment_mint_authority, 1_000_000_000);
    let impostor_asset_ata = anchor_spl::associated_token::get_associated_token_address_with_program_id(
        &impostor.pubkey(),
        &f.asset_mint,
        &f.ctx.token_program,
    );

    let accept = accept_deal_ix(
        &f.ctx.program_id,
        AcceptDealAccounts {
            buyer: &impostor.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            deal: &deal,
            vault: &vault,
            buyer_asset_account: &impostor_asset_ata,
            buyer_payment_account: &impostor_payment_ata,
            seller_payment_account: &f.seller_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
        },
    );
    let result = f.ctx.send(accept, &impostor, &[]);
    assert!(result.is_err(), "wrong buyer must be rejected");
}

#[test]
fn cancel_before_acceptance_refunds_tokens() {
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
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
        3,
        100_000_000,
        expiry_from_now(START_UNIX, 3_600),
        MEMO,
    );
    f.ctx.send(propose, &f.seller, &[]).unwrap();
    assert_eq!(f.ctx.balance(&f.seller_asset_ata), 7);
    assert_eq!(f.ctx.balance(&vault), 3);

    let cancel = cancel_deal_ix(
        &f.ctx.program_id,
        &f.seller.pubkey(),
        &f.asset_mint,
        &deal,
        &vault,
        &f.seller_asset_ata,
        &f.ctx.token_program,
    );
    f.ctx.send(cancel, &f.seller, &[]).unwrap();

    assert_eq!(f.ctx.balance(&f.seller_asset_ata), 10);
    assert!(
        f.ctx.svm.get_account(&deal).is_none()
            || f.ctx.svm.get_account(&deal).unwrap().data.is_empty()
    );
}

#[test]
fn accept_rejected_after_expiry() {
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
    let (deal, _) = f.ctx.deal_pda(&f.seller.pubkey(), &f.buyer.pubkey(), DEAL_ID);
    let (vault, _) = f.ctx.vault_pda(&deal);
    let expires = expiry_from_now(START_UNIX, 60); // 1 minute
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
        2,
        10_000_000,
        expires,
        MEMO,
    );
    f.ctx.send(propose, &f.seller, &[]).unwrap();

    // Time travel past the expiry.
    f.ctx.advance_time(120);

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
    assert!(f.ctx.send(accept, &f.buyer, &[]).is_err());
}

#[test]
fn expire_permissionless_after_deadline() {
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (deal, _) = f.ctx.deal_pda(&f.seller.pubkey(), &f.buyer.pubkey(), DEAL_ID);
    let (vault, _) = f.ctx.vault_pda(&deal);
    let expires = expiry_from_now(START_UNIX, 60);
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
        4,
        10_000_000,
        expires,
        MEMO,
    );
    f.ctx.send(propose, &f.seller, &[]).unwrap();

    // Expire call before deadline must fail.
    let cranker = Keypair::new();
    f.ctx.fund(&cranker.pubkey(), 2_000_000_000);
    let early = expire_deal_ix(
        &f.ctx.program_id,
        &cranker.pubkey(),
        &f.seller.pubkey(),
        &f.asset_mint,
        &deal,
        &vault,
        &f.seller_asset_ata,
        &f.ctx.token_program,
    );
    assert!(f.ctx.send(early, &cranker, &[]).is_err());

    // Advance past expiry.
    f.ctx.advance_time(120);

    let late = expire_deal_ix(
        &f.ctx.program_id,
        &cranker.pubkey(),
        &f.seller.pubkey(),
        &f.asset_mint,
        &deal,
        &vault,
        &f.seller_asset_ata,
        &f.ctx.token_program,
    );
    f.ctx.send(late, &cranker, &[]).unwrap();

    // Seller receives the 4 tokens back.
    assert_eq!(f.ctx.balance(&f.seller_asset_ata), 10);
    assert_eq!(f.ctx.get_deal(&deal).status, DealStatus::Expired);
}
