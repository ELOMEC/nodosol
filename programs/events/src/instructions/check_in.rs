use anchor_lang::prelude::*;

use crate::{
    constants::{EVENT_SEED, TICKET_SEED},
    error::EventsError,
    events_log::TicketCheckedIn,
    state::{Event, Ticket},
};

#[derive(Accounts)]
pub struct CheckIn<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [EVENT_SEED, event.creator.as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = creator @ EventsError::Unauthorized,
    )]
    pub event: Box<Account<'info, Event>>,

    #[account(
        mut,
        seeds = [TICKET_SEED, event.key().as_ref(), ticket.attendee.as_ref()],
        bump = ticket.bump,
        constraint = ticket.event == event.key() @ EventsError::TicketEventMismatch,
    )]
    pub ticket: Box<Account<'info, Ticket>>,
}

pub fn handle_check_in(ctx: Context<CheckIn>) -> Result<()> {
    require!(!ctx.accounts.ticket.checked_in, EventsError::AlreadyCheckedIn);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let ticket_key = ctx.accounts.ticket.key();
    let event_key = ctx.accounts.event.key();
    let attendee = ctx.accounts.ticket.attendee;
    let checked_in_by = ctx.accounts.creator.key();

    let ticket = &mut ctx.accounts.ticket;
    ticket.checked_in = true;
    ticket.checked_in_at = now;

    let event = &mut ctx.accounts.event;
    event.checked_in_count = event
        .checked_in_count
        .checked_add(1)
        .ok_or(EventsError::ArithmeticOverflow)?;

    emit!(TicketCheckedIn {
        event: event_key,
        ticket: ticket_key,
        attendee,
        checked_in_by,
        timestamp: now,
    });

    Ok(())
}
