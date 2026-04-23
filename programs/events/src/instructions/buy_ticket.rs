use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::{BPS_DENOMINATOR, CONFIG_SEED, EVENT_SEED, TICKET_SEED, UNLIMITED_CAPACITY, VAULT_SEED},
    error::EventsError,
    events_log::TicketPurchased,
    state::{Config, Event, Ticket},
};

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub attendee: Signer<'info>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = attendee,
    )]
    pub attendee_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [EVENT_SEED, event.creator.as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = mint @ EventsError::MintMismatch,
        has_one = vault @ EventsError::Unauthorized,
        constraint = event.active @ EventsError::EventInactive,
    )]
    pub event: Box<Account<'info, Event>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, event.key().as_ref()],
        bump = event.vault_bump,
        token::mint = mint,
        token::authority = event,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = attendee,
        space = 8 + Ticket::INIT_SPACE,
        seeds = [TICKET_SEED, event.key().as_ref(), attendee.key().as_ref()],
        bump,
    )]
    pub ticket: Box<Account<'info, Ticket>>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        address = config.treasury @ EventsError::TreasuryMismatch,
        token::mint = mint,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
    require!(!ctx.accounts.config.paused, EventsError::Paused);
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    require!(now >= ctx.accounts.event.starts_at, EventsError::EventNotStarted);
    require!(now < ctx.accounts.event.ends_at, EventsError::EventEnded);
    if ctx.accounts.event.capacity != UNLIMITED_CAPACITY {
        require!(
            ctx.accounts.event.sold_count < ctx.accounts.event.capacity,
            EventsError::CapacityReached
        );
    }

    let price = ctx.accounts.event.price;
    let fee_bps = ctx.accounts.config.fee_bps as u64;
    let fee = price
        .checked_mul(fee_bps)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(EventsError::ArithmeticOverflow)?;
    let creator_amount = price
        .checked_sub(fee)
        .ok_or(EventsError::ArithmeticOverflow)?;

    let decimals = ctx.accounts.mint.decimals;

    if fee > 0 {
        let fee_cpi = TransferChecked {
            from: ctx.accounts.attendee_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.attendee.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), fee_cpi),
            fee,
            decimals,
        )?;
    }

    if creator_amount > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.attendee_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.attendee.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
            creator_amount,
            decimals,
        )?;
    }

    let ticket_number = ctx
        .accounts
        .event
        .sold_count
        .checked_add(1)
        .ok_or(EventsError::ArithmeticOverflow)?;

    let event_key = ctx.accounts.event.key();

    let ticket = &mut ctx.accounts.ticket;
    ticket.event = event_key;
    ticket.attendee = ctx.accounts.attendee.key();
    ticket.ticket_number = ticket_number;
    ticket.price_paid = creator_amount;
    ticket.purchased_at = now;
    ticket.checked_in = false;
    ticket.checked_in_at = 0;
    ticket.bump = ctx.bumps.ticket;
    ticket.reserved = [0u8; 32];

    let event = &mut ctx.accounts.event;
    event.sold_count = ticket_number;
    event.total_revenue = event
        .total_revenue
        .checked_add(creator_amount)
        .ok_or(EventsError::ArithmeticOverflow)?;

    emit!(TicketPurchased {
        event: event_key,
        ticket: ticket.key(),
        attendee: ticket.attendee,
        ticket_number,
        price_paid: creator_amount,
        timestamp: now,
    });

    Ok(())
}
