use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_SEED, MAX_FEE_BPS},
    error::MarketplaceError,
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
        has_one = authority @ MarketplaceError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn handle_update_fee_bps(ctx: Context<UpdateFeeBps>, new_fee_bps: u16) -> Result<()> {
    require!(new_fee_bps <= MAX_FEE_BPS, MarketplaceError::FeeBpsTooHigh);
    let previous = ctx.accounts.config.fee_bps;
    ctx.accounts.config.fee_bps = new_fee_bps;

    emit!(FeeBpsUpdated {
        previous,
        next: new_fee_bps,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
