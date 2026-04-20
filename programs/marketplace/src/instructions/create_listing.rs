use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{LISTING_SEED, VAULT_SEED},
    error::MarketplaceError,
    events::ListingCreated,
    state::{Listing, ListingStatus},
};

#[derive(Accounts)]
pub struct CreateListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [LISTING_SEED, seller.key().as_ref(), asset_mint.key().as_ref()],
        bump,
    )]
    pub listing: Box<Account<'info, Listing>>,

    #[account(
        init,
        payer = seller,
        seeds = [VAULT_SEED, listing.key().as_ref()],
        bump,
        token::mint = asset_mint,
        token::authority = listing,
        token::token_program = asset_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = seller,
        token::token_program = asset_token_program,
    )]
    pub seller_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_listing(
    ctx: Context<CreateListing>,
    price_per_token: u64,
    quantity: u64,
) -> Result<()> {
    require!(price_per_token > 0, MarketplaceError::InvalidPrice);
    require!(quantity > 0, MarketplaceError::InvalidQuantity);

    let asset_decimals = ctx.accounts.asset_mint.decimals;

    // Transfer seller's tokens into the listing vault.
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.seller_asset_account.to_account_info(),
        mint: ctx.accounts.asset_mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
    };
    transfer_checked(
        CpiContext::new(ctx.accounts.asset_token_program.key(), cpi_accounts),
        quantity,
        asset_decimals,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let listing = &mut ctx.accounts.listing;
    listing.seller = ctx.accounts.seller.key();
    listing.asset_mint = ctx.accounts.asset_mint.key();
    listing.payment_mint = ctx.accounts.payment_mint.key();
    listing.price_per_token = price_per_token;
    listing.initial_quantity = quantity;
    listing.remaining_quantity = quantity;
    listing.status = ListingStatus::Active;
    listing.created_at = now;
    listing.updated_at = now;
    listing.bump = ctx.bumps.listing;
    listing.vault_bump = ctx.bumps.vault;
    listing.reserved = [0u8; 32];

    emit!(ListingCreated {
        seller: listing.seller,
        asset_mint: listing.asset_mint,
        payment_mint: listing.payment_mint,
        price_per_token,
        quantity,
        timestamp: now,
    });
    Ok(())
}
