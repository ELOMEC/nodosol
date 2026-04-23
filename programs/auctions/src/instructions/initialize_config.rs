use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::{
    constants::{CONFIG_SEED, MAX_FEE_BPS},
    error::AuctionsError,
    events::AuctionConfigInitialized,
    state::AuctionConfig,
};

#[derive(Accounts)]
pub struct InitializeAuctionConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + AuctionConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Box<Account<'info, AuctionConfig>>,

    /// CHECK: used for token-type validation of the treasury ATA on each
    /// auction settlement — not read here beyond its key.
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The treasury ATA (Token-2022 / SPL Token account) that receives
    /// platform fees on settlement. Enforced to match `payment_mint`.
    #[account(token::mint = payment_mint)]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_auction_config(
    ctx: Context<InitializeAuctionConfig>,
    fee_bps: u16,
) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, AuctionsError::FeeBpsTooHigh);

    let now = Clock::get()?.unix_timestamp;
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.treasury = ctx.accounts.treasury.key();
    config.fee_bps = fee_bps;
    config.bump = ctx.bumps.config;
    config.paused = false;
    config.reserved = [0u8; 63];

    emit!(AuctionConfigInitialized {
        authority: config.authority,
        treasury: config.treasury,
        fee_bps,
        timestamp: now,
    });
    Ok(())
}
