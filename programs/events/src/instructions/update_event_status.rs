use anchor_lang::prelude::*;

use crate::{
    constants::EVENT_SEED,
    error::EventsError,
    events_log::EventStatusUpdated,
    state::Event,
};

#[derive(Accounts)]
pub struct UpdateEventStatus<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [EVENT_SEED, creator.key().as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = creator @ EventsError::Unauthorized,
    )]
    pub event: Account<'info, Event>,
}

pub fn handle_update_event_status(
    ctx: Context<UpdateEventStatus>,
    active: bool,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    event.active = active;

    emit!(EventStatusUpdated {
        event: event.key(),
        creator: event.creator,
        active,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
