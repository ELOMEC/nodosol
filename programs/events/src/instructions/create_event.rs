use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{EVENT_SEED, MAX_METADATA_URI_LEN, VAULT_SEED},
    error::EventsError,
    events_log::EventCreated,
    state::Event,
};

#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct CreateEvent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + Event::INIT_SPACE,
        seeds = [EVENT_SEED, creator.key().as_ref(), &event_id.to_le_bytes()],
        bump,
    )]
    pub event: Box<Account<'info, Event>>,

    #[account(
        init,
        payer = creator,
        seeds = [VAULT_SEED, event.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = event,
        token::token_program = token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_event(
    ctx: Context<CreateEvent>,
    event_id: u64,
    price: u64,
    capacity: u64,
    starts_at: i64,
    ends_at: i64,
    metadata_uri: String,
) -> Result<()> {
    require!(ends_at > starts_at, EventsError::InvalidDates);
    require!(
        !metadata_uri.is_empty() && metadata_uri.len() <= MAX_METADATA_URI_LEN,
        EventsError::InvalidMetadataUri
    );

    let clock = Clock::get()?;
    let event = &mut ctx.accounts.event;

    event.creator = ctx.accounts.creator.key();
    event.mint = ctx.accounts.mint.key();
    event.vault = ctx.accounts.vault.key();
    event.event_id = event_id;
    event.price = price;
    event.capacity = capacity;
    event.sold_count = 0;
    event.checked_in_count = 0;
    event.starts_at = starts_at;
    event.ends_at = ends_at;
    event.active = true;
    event.metadata_uri = metadata_uri;
    event.total_revenue = 0;
    event.total_withdrawn = 0;
    event.created_at = clock.unix_timestamp;
    event.bump = ctx.bumps.event;
    event.vault_bump = ctx.bumps.vault;
    event.reserved = [0u8; 64];

    emit!(EventCreated {
        event: event.key(),
        creator: event.creator,
        mint: event.mint,
        event_id,
        price,
        capacity,
        starts_at,
        ends_at,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
