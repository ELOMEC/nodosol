use anchor_lang::prelude::*;

use crate::{
    constants::LISTING_SEED,
    error::MarketplaceError,
    events::ListingPriceUpdated,
    state::{Listing, ListingStatus},
};

#[derive(Accounts)]
pub struct UpdateListingPrice<'info> {
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [LISTING_SEED, seller.key().as_ref(), listing.asset_mint.as_ref()],
        bump = listing.bump,
        constraint = listing.seller == seller.key(),
    )]
    pub listing: Account<'info, Listing>,
}

pub fn handle_update_listing_price(
    ctx: Context<UpdateListingPrice>,
    new_price: u64,
) -> Result<()> {
    require!(new_price > 0, MarketplaceError::InvalidPrice);
    let listing = &mut ctx.accounts.listing;
    require!(
        listing.status == ListingStatus::Active,
        MarketplaceError::ListingNotActive
    );

    let previous = listing.price_per_token;
    listing.price_per_token = new_price;
    listing.updated_at = Clock::get()?.unix_timestamp;

    emit!(ListingPriceUpdated {
        seller: listing.seller,
        asset_mint: listing.asset_mint,
        previous_price: previous,
        next_price: new_price,
        timestamp: listing.updated_at,
    });
    Ok(())
}
