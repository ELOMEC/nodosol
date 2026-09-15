//! Sad-path coverage for marketplace gaps flagged in
//! `docs/TEST_GAP_ANALYSIS.md`: update_listing_price + cancel_listing
//! edges + admin fee-clamp violations.

mod common;

use common::{
    cancel_listing_ix, create_listing_ix, update_fee_bps_ix, update_listing_price_ix,
    CreateListingAccounts, Fixture,
};
use marketplace::state::ListingStatus;
use solana_keypair::Keypair;
use solana_signer::Signer;

const MAX_FEE_BPS: u16 = 1_000;

fn seed_active_listing(f: &mut Fixture) -> (solana_pubkey::Pubkey, solana_pubkey::Pubkey) {
    let (listing, _) = f.ctx.listing_pda(&f.seller.pubkey(), &f.asset_mint);
    let (vault, _) = f.ctx.vault_pda(&listing);
    let create = create_listing_ix(
        &f.ctx.program_id,
        CreateListingAccounts {
            seller: &f.seller.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            listing: &listing,
            vault: &vault,
            seller_asset_account: &f.seller_asset_ata,
            token_program: &f.ctx.token_program,
        },
        100_000_000,
        5,
    );
    f.ctx.send(create, &f.seller, &[]).unwrap();
    (listing, vault)
}

// ---------------------------------------------------------------------------
// update_listing_price sad paths
// ---------------------------------------------------------------------------

#[test]
fn update_listing_price_rejects_zero_price() {
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (listing, _vault) = seed_active_listing(&mut f);

    let ix = update_listing_price_ix(&f.ctx.program_id, &f.seller.pubkey(), &listing, 0);
    let result = f.ctx.send(ix, &f.seller, &[]);
    assert!(result.is_err(), "update price=0 must fail (InvalidPrice)");

    let state = f.ctx.get_listing(&listing);
    assert_eq!(state.price_per_token, 100_000_000);
}

#[test]
fn update_listing_price_rejects_after_cancel() {
    // cancel_listing closes the listing PDA via `close = seller`, so a
    // subsequent update must fail at account derivation (the PDA no
    // longer exists).
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (listing, vault) = seed_active_listing(&mut f);

    let cancel = cancel_listing_ix(
        &f.ctx.program_id,
        &f.seller.pubkey(),
        &f.asset_mint,
        &listing,
        &vault,
        &f.seller_asset_ata,
        &f.ctx.token_program,
    );
    f.ctx.send(cancel, &f.seller, &[]).unwrap();
    assert!(
        f.ctx.svm.get_account(&listing).is_none(),
        "cancel must close the listing PDA"
    );

    // Now try to update price on the closed listing.
    let ix = update_listing_price_ix(&f.ctx.program_id, &f.seller.pubkey(), &listing, 50_000_000);
    let result = f.ctx.send(ix, &f.seller, &[]);
    assert!(
        result.is_err(),
        "update on closed listing must fail (account missing)"
    );
}

#[test]
fn update_listing_price_rejects_when_signer_is_not_seller() {
    // The listing PDA seeds include `seller`. A different signer can't
    // produce the same PDA, so the seeds constraint rejects before the
    // handler runs.
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (listing, _vault) = seed_active_listing(&mut f);

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = update_listing_price_ix(&f.ctx.program_id, &attacker.pubkey(), &listing, 1);
    let result = f.ctx.send(ix, &attacker, &[]);
    assert!(
        result.is_err(),
        "update by non-seller must fail (PDA seeds + has_one)"
    );

    let state = f.ctx.get_listing(&listing);
    assert_eq!(state.price_per_token, 100_000_000);
    assert_eq!(state.status, ListingStatus::Active);
}

// ---------------------------------------------------------------------------
// cancel_listing sad paths
// ---------------------------------------------------------------------------

#[test]
fn cancel_listing_rejects_when_already_cancelled() {
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (listing, vault) = seed_active_listing(&mut f);

    let cancel = cancel_listing_ix(
        &f.ctx.program_id,
        &f.seller.pubkey(),
        &f.asset_mint,
        &listing,
        &vault,
        &f.seller_asset_ata,
        &f.ctx.token_program,
    );
    f.ctx.send(cancel, &f.seller, &[]).unwrap();

    // Second cancel.
    let cancel2 = cancel_listing_ix(
        &f.ctx.program_id,
        &f.seller.pubkey(),
        &f.asset_mint,
        &listing,
        &vault,
        &f.seller_asset_ata,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(cancel2, &f.seller, &[]);
    assert!(
        result.is_err(),
        "double cancel must fail (ListingNotActive)"
    );
}

#[test]
fn cancel_listing_rejects_when_signer_is_not_seller() {
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (listing, vault) = seed_active_listing(&mut f);

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);
    let attacker_ata =
        f.ctx
            .create_ata(&attacker, &attacker.pubkey(), &f.asset_mint);

    let ix = cancel_listing_ix(
        &f.ctx.program_id,
        &attacker.pubkey(),
        &f.asset_mint,
        &listing,
        &vault,
        &attacker_ata,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(ix, &attacker, &[]);
    assert!(
        result.is_err(),
        "cancel by non-seller must fail (PDA seeds mismatch)"
    );

    // Vault still holds the asset; listing still Active.
    assert_eq!(f.ctx.balance(&vault), 5);
    assert_eq!(f.ctx.get_listing(&listing).status, ListingStatus::Active);
}

// ---------------------------------------------------------------------------
// update_fee_bps clamp
// ---------------------------------------------------------------------------

#[test]
fn update_fee_bps_rejects_above_max() {
    let mut f = Fixture::new_with_fee(0, 10, 0);

    let ix = update_fee_bps_ix(
        &f.ctx.program_id,
        &f.config_authority.pubkey(),
        &f.config,
        MAX_FEE_BPS + 1,
    );
    let result = f.ctx.send(ix, &f.config_authority, &[]);
    assert!(
        result.is_err(),
        "fee_bps > MAX_FEE_BPS must fail (FeeBpsTooHigh)"
    );

    let cfg = f.ctx.get_config(&f.config);
    assert_eq!(cfg.fee_bps, 0, "fee_bps must remain unchanged on rejection");
}
