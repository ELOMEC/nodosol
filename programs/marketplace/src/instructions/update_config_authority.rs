use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    error::MarketplaceError,
    events::AuthorityUpdated,
    state::Config,
};

#[derive(Accounts)]
pub struct UpdateConfigAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ MarketplaceError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: only the key is stored.
    pub new_authority: UncheckedAccount<'info>,
}

pub fn handle_update_config_authority(ctx: Context<UpdateConfigAuthority>) -> Result<()> {
    let previous = ctx.accounts.config.authority;
    let next = ctx.accounts.new_authority.key();
    ctx.accounts.config.authority = next;

    emit!(AuthorityUpdated {
        previous,
        next,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
