use anchor_lang::prelude::*;

use crate::{
    constants::{EVENT_SEED, TIER_SEED},
    error::EventTicketsError,
    events::TierPriceUpdated,
    state::{Event, TicketTier},
};

#[derive(Accounts)]
pub struct UpdateTierPrice<'info> {
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

pub fn handle_update_tier_price(ctx: Context<UpdateTierPrice>, new_price: u64) -> Result<()> {
    require!(new_price > 0, EventTicketsError::InvalidPrice);
    let now = Clock::get()?.unix_timestamp;
    let tier = &mut ctx.accounts.tier;
    let previous = tier.price;
    tier.price = new_price;
    tier.updated_at = now;
    emit!(TierPriceUpdated {
        tier: tier.key(),
        previous,
        next: new_price,
        timestamp: now,
    });
    Ok(())
}
