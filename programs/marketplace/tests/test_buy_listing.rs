mod common;

use common::{
    buy_listing_ix, cancel_listing_ix, create_listing_ix, update_listing_price_ix,
    BuyListingAccounts, CreateListingAccounts, Fixture,
};
use marketplace::state::ListingStatus;
use solana_signer::Signer;

fn new_listing(f: &mut Fixture, price: u64, qty: u64) -> (solana_pubkey::Pubkey, solana_pubkey::Pubkey) {
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
        price,
        qty,
    );
    f.ctx.send(ix, &f.seller, &[]).unwrap();
    (listing, vault)
}

#[test]
fn buy_happy_path_with_fee() {
    // 2.5% fee, seller has 10 assets, buyer has 1000 USDC.
    let mut f = Fixture::new_with_fee(250, 10, 1_000_000_000);
    let price = 100_000_000u64; // 100 USDC per token (6 dec)
    let list_qty = 5u64;
    let (listing, vault) = new_listing(&mut f, price, list_qty);

    // Buyer buys 3 tokens = 300 USDC total, fee 7.5 USDC, seller 292.5 USDC.
    let buy_qty = 3u64;
    let ix = buy_listing_ix(
        &f.ctx.program_id,
        BuyListingAccounts {
            buyer: &f.buyer.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            listing: &listing,
            vault: &vault,
            buyer_asset_account: &f.buyer_asset_ata,
            buyer_payment_account: &f.buyer_payment_ata,
            seller_payment_account: &f.seller_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
        },
        buy_qty,
    );
    f.ctx.send(ix, &f.buyer, &[]).unwrap();

    assert_eq!(f.ctx.balance(&f.buyer_asset_ata), 3);
    assert_eq!(f.ctx.balance(&vault), 2);
    assert_eq!(f.ctx.balance(&f.seller_payment_ata), 292_500_000);
    assert_eq!(f.ctx.balance(&f.treasury), 7_500_000);
    assert_eq!(f.ctx.balance(&f.buyer_payment_ata), 1_000_000_000 - 300_000_000);

    let state = f.ctx.get_listing(&listing);
    assert_eq!(state.remaining_quantity, 2);
    assert_eq!(state.status, ListingStatus::Active);
}

#[test]
fn buy_all_marks_listing_sold_out() {
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
    let (listing, vault) = new_listing(&mut f, 50_000_000, 5);
    let ix = buy_listing_ix(
        &f.ctx.program_id,
        BuyListingAccounts {
            buyer: &f.buyer.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            listing: &listing,
            vault: &vault,
            buyer_asset_account: &f.buyer_asset_ata,
            buyer_payment_account: &f.buyer_payment_ata,
            seller_payment_account: &f.seller_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
        },
        5,
    );
    f.ctx.send(ix, &f.buyer, &[]).unwrap();
    assert_eq!(f.ctx.get_listing(&listing).status, ListingStatus::SoldOut);
    assert_eq!(f.ctx.balance(&vault), 0);
}

#[test]
fn buy_rejects_over_remaining() {
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
    let (listing, vault) = new_listing(&mut f, 10_000_000, 3);
    let ix = buy_listing_ix(
        &f.ctx.program_id,
        BuyListingAccounts {
            buyer: &f.buyer.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            listing: &listing,
            vault: &vault,
            buyer_asset_account: &f.buyer_asset_ata,
            buyer_payment_account: &f.buyer_payment_ata,
            seller_payment_account: &f.seller_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
        },
        5, // only 3 available
    );
    let result = f.ctx.send(ix, &f.buyer, &[]);
    assert!(result.is_err());
}

#[test]
fn update_listing_price_works() {
    let mut f = Fixture::new_with_fee(0, 10, 0);
    let (listing, _) = new_listing(&mut f, 100_000_000, 5);
    let ix = update_listing_price_ix(&f.ctx.program_id, &f.seller.pubkey(), &listing, 75_000_000);
    f.ctx.send(ix, &f.seller, &[]).unwrap();
    assert_eq!(f.ctx.get_listing(&listing).price_per_token, 75_000_000);
}

#[test]
fn cancel_refunds_remaining_to_seller() {
    let mut f = Fixture::new_with_fee(0, 10, 1_000_000_000);
    let (listing, vault) = new_listing(&mut f, 50_000_000, 5);
    // Buyer takes 2 first.
    let ix = buy_listing_ix(
        &f.ctx.program_id,
        BuyListingAccounts {
            buyer: &f.buyer.pubkey(),
            asset_mint: &f.asset_mint,
            payment_mint: &f.payment_mint,
            listing: &listing,
            vault: &vault,
            buyer_asset_account: &f.buyer_asset_ata,
            buyer_payment_account: &f.buyer_payment_ata,
            seller_payment_account: &f.seller_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
        },
        2,
    );
    f.ctx.send(ix, &f.buyer, &[]).unwrap();

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

    // 5 starting - 5 listed + 3 refunded = 3 back in seller's ATA.
    assert_eq!(f.ctx.balance(&f.seller_asset_ata), 5 + 3); // 5 remained before listing + 3 refunded
    // Listing closed (account no longer exists).
    assert!(f.ctx.svm.get_account(&listing).is_none() || f.ctx.svm.get_account(&listing).unwrap().data.is_empty());
}
