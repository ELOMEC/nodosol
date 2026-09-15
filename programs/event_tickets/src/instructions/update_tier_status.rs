use anchor_lang::prelude::*;

use crate::{
    constants::{EVENT_SEED, TIER_SEED},
    error::EventTicketsError,
    events::TierStatusChanged,
    state::{Event, TicketTier, TierStatus},
};

#[derive(Accounts)]
pub struct UpdateTierStatus<'info> {
    #[account(
        address = event.creator @ EventTicketsError::NotCreator,
    )]
    pub creator: Signer<'info>,

    #[account(
        seeds = [EVENT_SEED, event.creator.as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
    )]
    pub event: Box<Account<'info, Event>>,

    #[account(
        mut,
        seeds = [TIER_SEED, event.key().as_ref(), &tier.tier_id.to_le_bytes()],
        bump = tier.bump,
        has_one = event @ EventTicketsError::TierEventMismatch,
    )]
    pub tier: Box<Account<'info, TicketTier>>,
}

pub fn handle_update_tier_status(
    ctx: Context<UpdateTierStatus>,
    new_status: TierStatus,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let tier = &mut ctx.accounts.tier;
    let previous = tier.status;
    // Closed is terminal.
    require!(
        previous != TierStatus::Closed,
        EventTicketsError::InvalidStatusTransition
    );
    tier.status = new_status;
    tier.updated_at = now;
    emit!(TierStatusChanged {
        tier: tier.key(),
        previous,
        next: new_status,
        timestamp: now,
    });
    Ok(())
}
