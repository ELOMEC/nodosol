use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    error::AuctionsError,
    events::PauseUpdated,
    state::AuctionConfig,
};

/// Flip the program-wide pause flag. Authority-only. While `paused` is
/// true, fund-moving instructions revert with `AuctionsError::Paused` so
/// funds cannot be moved while an exploit is being patched.
///
/// Intended to be used as an emergency kill-switch pending a program
/// upgrade. Should be callable by the multisig that owns `authority`.
#[derive(Accounts)]
pub struct UpdatePause<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ AuctionsError::Unauthorized,
    )]
    pub config: Box<Account<'info, AuctionConfig>>,
}

pub fn handle_update_pause(ctx: Context<UpdatePause>, paused: bool) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.paused = paused;

    emit!(PauseUpdated {
        authority: ctx.accounts.authority.key(),
        paused,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
