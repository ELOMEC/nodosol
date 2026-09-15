mod common;

use common::{create_listing_ix, CreateListingAccounts, Fixture};
use marketplace::state::ListingStatus;
use solana_signer::Signer;

#[test]
fn create_listing_transfers_into_vault() {
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (listing, _) = f.ctx.listing_pda(&f.seller.pubkey(), &f.asset_mint);
    let (vault, _) = f.ctx.vault_pda(&listing);

    let ix = create_listing_ix(
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
        100_000_000, // 100 USDC per token (6 decimals)
        5,
    );
    f.ctx.send(ix, &f.seller, &[]).unwrap();

    let state = f.ctx.get_listing(&listing);
    assert_eq!(state.seller, f.seller.pubkey());
    assert_eq!(state.asset_mint, f.asset_mint);
    assert_eq!(state.payment_mint, f.payment_mint);
    assert_eq!(state.price_per_token, 100_000_000);
    assert_eq!(state.initial_quantity, 5);
    assert_eq!(state.remaining_quantity, 5);
    assert_eq!(state.status, ListingStatus::Active);

    assert_eq!(f.ctx.balance(&f.seller_asset_ata), 5); // 10 - 5 = 5
    assert_eq!(f.ctx.balance(&vault), 5);
}

#[test]
fn create_listing_rejects_zero_price() {
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (listing, _) = f.ctx.listing_pda(&f.seller.pubkey(), &f.asset_mint);
    let (vault, _) = f.ctx.vault_pda(&listing);

    let ix = create_listing_ix(
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
        0,
        5,
    );
    let result = f.ctx.send(ix, &f.seller, &[]);
    assert!(result.is_err());
}

#[test]
fn create_listing_rejects_insufficient_balance() {
    let mut f = Fixture::new_with_fee(0, 3, 0);
    let (listing, _) = f.ctx.listing_pda(&f.seller.pubkey(), &f.asset_mint);
    let (vault, _) = f.ctx.vault_pda(&listing);

    let ix = create_listing_ix(
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
        10, // seller only has 3
    );
    let result = f.ctx.send(ix, &f.seller, &[]);
    assert!(result.is_err());
}
