use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, MAX_FEE_BPS},
    error::TipJarError,
    events::FeeBpsUpdated,
    state::Config,
};

#[derive(Accounts)]
pub struct UpdateFeeBps<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ TipJarError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn handle_update_fee_bps(
    ctx: Context<UpdateFeeBps>,
    new_fee_bps: u16,
) -> Result<()> {
    require!(new_fee_bps <= MAX_FEE_BPS, TipJarError::FeeBpsTooHigh);

    let config = &mut ctx.accounts.config;
    let previous = config.fee_bps;
    config.fee_bps = new_fee_bps;

    emit!(FeeBpsUpdated {
        previous_bps: previous,
        new_bps: new_fee_bps,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
