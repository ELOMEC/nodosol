use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::CONFIG_SEED,
    error::EventsError,
    events_log::TreasuryUpdated,
    state::Config,
};

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ EventsError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    pub new_treasury: InterfaceAccount<'info, TokenAccount>,
}

pub fn handle_update_treasury(ctx: Context<UpdateTreasury>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let previous = config.treasury;
    config.treasury = ctx.accounts.new_treasury.key();

    emit!(TreasuryUpdated {
        previous_treasury: previous,
        new_treasury: config.treasury,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
