use anchor_lang::prelude::*;

use crate::{
    constants::{EVENT_SEED, TIER_SEED},
    error::EventTicketsError,
    events::TierCapacityUpdated,
    state::{Event, TicketTier},
};

#[derive(Accounts)]
pub struct UpdateTierCapacity<'info> {
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

pub fn handle_update_tier_capacity(
    ctx: Context<UpdateTierCapacity>,
    new_capacity: u32,
) -> Result<()> {
    require!(new_capacity > 0, EventTicketsError::InvalidCapacity);
    let now = Clock::get()?.unix_timestamp;
    let tier = &mut ctx.accounts.tier;
    require!(new_capacity >= tier.sold, EventTicketsError::CapacityBelowSold);
    let previous = tier.capacity;
    tier.capacity = new_capacity;
    tier.updated_at = now;
    emit!(TierCapacityUpdated {
        tier: tier.key(),
        previous,
        next: new_capacity,
        timestamp: now,
    });
    Ok(())
}
