use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    events::RegistryInitialized,
    state::RegistryConfig,
};

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + RegistryConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, RegistryConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.issuer_count = 0;
    config.bump = ctx.bumps.config;
    config.reserved = [0u8; 63];

    emit!(RegistryInitialized {
        authority: config.authority,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
