use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    error::SubscriptionError,
    events::ConfigAuthorityUpdated,
    state::Config,
};

#[derive(Accounts)]
pub struct UpdateConfigAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ SubscriptionError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: new authority is only stored; signatures are not required here.
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
