use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    error::RegistryError,
    events::RegistryAuthorityUpdated,
    state::RegistryConfig,
};

#[derive(Accounts)]
pub struct UpdateRegistryAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    /// CHECK: new authority; only the pubkey is stored.
    pub new_authority: UncheckedAccount<'info>,
}

pub fn handle_update_registry_authority(ctx: Context<UpdateRegistryAuthority>) -> Result<()> {
    let previous = ctx.accounts.config.authority;
    let next = ctx.accounts.new_authority.key();
    ctx.accounts.config.authority = next;

    emit!(RegistryAuthorityUpdated {
        previous,
        next,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
