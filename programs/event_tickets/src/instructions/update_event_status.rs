use anchor_lang::prelude::*;

use crate::{
    constants::EVENT_SEED,
    error::EventTicketsError,
    events::EventStatusChanged,
    state::{Event, EventStatus},
};

#[derive(Accounts)]
pub struct UpdateEventStatus<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [EVENT_SEED, creator.key().as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = creator @ EventTicketsError::NotCreator,
    )]
    pub event: Account<'info, Event>,
}

pub fn handle_update_event_status(
    ctx: Context<UpdateEventStatus>,
    new_status: EventStatus,
) -> Result<()> {
    let event = &mut ctx.accounts.event;
    let previous = event.status;
    require!(
        is_transition_allowed(previous, new_status),
        EventTicketsError::InvalidStatusTransition
    );
    let now = Clock::get()?.unix_timestamp;
    event.status = new_status;
    event.updated_at = now;

    emit!(EventStatusChanged {
        event: event.key(),
        previous,
        next: new_status,
        timestamp: now,
    });
    Ok(())
}

fn is_transition_allowed(from: EventStatus, to: EventStatus) -> bool {
    use EventStatus::*;
    match (from, to) {
        (a, b) if a == b => false,
        (Closed, _) => false,
        _ => matches!(to, Active | Paused | Closed),
    }
}
