use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{BPS_DENOMINATOR, CONFIG_SEED, LISTING_SEED, VAULT_SEED},
    error::MarketplaceError,
    events::ListingBought,
    state::{Config, Listing, ListingStatus},
};

#[derive(Accounts)]
pub struct BuyListing<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [LISTING_SEED, listing.seller.as_ref(), listing.asset_mint.as_ref()],
        bump = listing.bump,
        constraint = listing.asset_mint == asset_mint.key() @ MarketplaceError::AssetMintMismatch,
        constraint = listing.payment_mint == payment_mint.key() @ MarketplaceError::PaymentMintMismatch,
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
        init_if_needed,
        payer = buyer,
        associated_token::mint = asset_mint,
        associated_token::authority = buyer,
        associated_token::token_program = asset_token_program,
    )]
    pub buyer_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = buyer,
        token::token_program = payment_token_program,
    )]
    pub buyer_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::token_program = payment_token_program,
    )]
    pub seller_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        address = config.treasury @ MarketplaceError::TreasuryMismatch,
        token::mint = payment_mint,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    pub asset_token_program: Interface<'info, TokenInterface>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_buy_listing(ctx: Context<BuyListing>, quantity: u64) -> Result<()> {
    require!(quantity > 0, MarketplaceError::InvalidQuantity);
    let listing = &mut ctx.accounts.listing;
    require!(
        listing.status == ListingStatus::Active,
        MarketplaceError::ListingNotActive
    );
    require!(
        quantity <= listing.remaining_quantity,
        MarketplaceError::QuantityExceedsRemaining
    );

    let total = listing
        .price_per_token
        .checked_mul(quantity)
        .ok_or(MarketplaceError::ArithmeticOverflow)?;
    let fee = total
        .checked_mul(ctx.accounts.config.fee_bps as u64)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(MarketplaceError::ArithmeticOverflow)?;
    let seller_share = total
        .checked_sub(fee)
        .ok_or(MarketplaceError::ArithmeticOverflow)?;

    let payment_decimals = ctx.accounts.payment_mint.decimals;
    let asset_decimals = ctx.accounts.asset_mint.decimals;

    // Buyer pays fee to treasury.
    if fee > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.buyer_payment_account.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        transfer_checked(
            CpiContext::new(ctx.accounts.payment_token_program.key(), cpi_accounts),
            fee,
            payment_decimals,
        )?;
    }

    // Buyer pays seller share.
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.buyer_payment_account.to_account_info(),
        mint: ctx.accounts.payment_mint.to_account_info(),
        to: ctx.accounts.seller_payment_account.to_account_info(),
        authority: ctx.accounts.buyer.to_account_info(),
    };
    transfer_checked(
        CpiContext::new(ctx.accounts.payment_token_program.key(), cpi_accounts),
        seller_share,
        payment_decimals,
    )?;

    // Vault releases RWA tokens to buyer — listing PDA signs.
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

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.asset_mint.to_account_info(),
        to: ctx.accounts.buyer_asset_account.to_account_info(),
        authority: listing.to_account_info(),
    };
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.asset_token_program.key(),
            cpi_accounts,
            signer_seeds_arr,
        ),
        quantity,
        asset_decimals,
    )?;

    let now = Clock::get()?.unix_timestamp;
    listing.remaining_quantity = listing
        .remaining_quantity
        .checked_sub(quantity)
        .ok_or(MarketplaceError::ArithmeticOverflow)?;
    if listing.remaining_quantity == 0 {
        listing.status = ListingStatus::SoldOut;
    }
    listing.updated_at = now;

    emit!(ListingBought {
        buyer: ctx.accounts.buyer.key(),
        seller: listing.seller,
        asset_mint: listing.asset_mint,
        quantity,
        seller_share,
        fee,
        remaining_quantity: listing.remaining_quantity,
        timestamp: now,
    });
    Ok(())
}
