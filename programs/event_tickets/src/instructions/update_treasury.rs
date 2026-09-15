use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::CONFIG_SEED, error::EventTicketsError, events::TreasuryUpdated, state::Config,
};

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ EventTicketsError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    pub new_treasury: InterfaceAccount<'info, TokenAccount>,
}

pub fn handle_update_treasury(ctx: Context<UpdateTreasury>) -> Result<()> {
    let previous = ctx.accounts.config.treasury;
    let next = ctx.accounts.new_treasury.key();
    ctx.accounts.config.treasury = next;
    emit!(TreasuryUpdated {
        previous,
        next,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
