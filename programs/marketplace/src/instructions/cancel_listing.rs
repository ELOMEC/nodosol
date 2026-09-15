use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{close_account, transfer_checked, CloseAccount, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{LISTING_SEED, VAULT_SEED},
    error::MarketplaceError,
    events::ListingCancelled,
    state::{Listing, ListingStatus},
};

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        close = seller,
        seeds = [LISTING_SEED, seller.key().as_ref(), asset_mint.key().as_ref()],
        bump = listing.bump,
        constraint = listing.seller == seller.key(),
        constraint = listing.asset_mint == asset_mint.key() @ MarketplaceError::AssetMintMismatch,
    )]
    pub listing: Box<Account<'info, Listing>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, listing.key().as_ref()],
        bump = listing.vault_bump,
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
}

pub fn handle_cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
    let listing = &mut ctx.accounts.listing;
    require!(
        listing.status == ListingStatus::Active,
        MarketplaceError::ListingNotActive
    );

    let remaining = listing.remaining_quantity;
    let decimals = ctx.accounts.asset_mint.decimals;

    let seller_key = listing.seller;
    let asset_mint_key = listing.asset_mint;
    let listing_bump = listing.bump;
    let listing_signer_seeds: &[&[u8]] = &[
        LISTING_SEED,
        seller_key.as_ref(),
        asset_mint_key.as_ref(),
        std::slice::from_ref(&listing_bump),
    ];
    let signer_seeds_arr: &[&[&[u8]]] = &[listing_signer_seeds];

    // Refund remaining tokens to seller if any.
    if remaining > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.asset_mint.to_account_info(),
            to: ctx.accounts.seller_asset_account.to_account_info(),
            authority: listing.to_account_info(),
        };
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.asset_token_program.key(),
                cpi_accounts,
                signer_seeds_arr,
            ),
            remaining,
            decimals,
        )?;
    }

    // Close the vault account and reclaim rent to the seller.
    let cpi_accounts = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.seller.to_account_info(),
        authority: listing.to_account_info(),
    };
    close_account(CpiContext::new_with_signer(
        ctx.accounts.asset_token_program.key(),
        cpi_accounts,
        signer_seeds_arr,
    ))?;

    listing.status = ListingStatus::Cancelled;
    listing.remaining_quantity = 0;
    listing.updated_at = Clock::get()?.unix_timestamp;

    emit!(ListingCancelled {
        seller: listing.seller,
        asset_mint: listing.asset_mint,
        refunded_quantity: remaining,
        timestamp: listing.updated_at,
    });
    Ok(())
}
