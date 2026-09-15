use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    error::EventsError,
    events_log::ConfigAuthorityUpdated,
    state::Config,
};

#[derive(Accounts)]
pub struct UpdateConfigAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ EventsError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: stored only; signature not required here.
    pub new_authority: UncheckedAccount<'info>,
}

pub fn handle_update_authority(ctx: Context<UpdateConfigAuthority>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let previous = config.authority;
    config.authority = ctx.accounts.new_authority.key();

    emit!(ConfigAuthorityUpdated {
        previous_authority: previous,
        new_authority: config.authority,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
