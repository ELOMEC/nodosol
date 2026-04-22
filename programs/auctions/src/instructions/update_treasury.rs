use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::CONFIG_SEED,
    error::AuctionsError,
    events::TreasuryUpdated,
    state::AuctionConfig,
};

#[derive(Accounts)]
pub struct UpdateAuctionTreasury<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ AuctionsError::Unauthorized,
    )]
    pub config: Account<'info, AuctionConfig>,

    pub new_treasury: InterfaceAccount<'info, TokenAccount>,
}

pub fn handle_update_auction_treasury(ctx: Context<UpdateAuctionTreasury>) -> Result<()> {
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
