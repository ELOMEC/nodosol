use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::{CONFIG_SEED, MAX_FEE_BPS},
    error::EventTicketsError,
    events::ConfigInitialized,
    state::Config,
};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub treasury: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, EventTicketsError::FeeBpsTooHigh);
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.treasury = ctx.accounts.treasury.key();
    config.fee_bps = fee_bps;
    config.bump = ctx.bumps.config;
    config.reserved = [0u8; 64];

    emit!(ConfigInitialized {
        authority: config.authority,
        treasury: config.treasury,
        fee_bps,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
