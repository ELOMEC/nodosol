use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{EVENT_SEED, MAX_NAME_LEN, MAX_SYMBOL_LEN, MAX_URI_LEN, VAULT_SEED},
    error::EventTicketsError,
    events::EventCreated,
    state::{Event, EventStatus},
};

#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct CreateEvent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

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
        token::mint = payment_mint,
        token::authority = event,
        token::token_program = payment_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_event(
    ctx: Context<CreateEvent>,
    event_id: u64,
    price: u64,
    capacity: u64,
    starts_at: i64,
    ends_at: i64,
    name: String,
    symbol: String,
    metadata_uri: String,
) -> Result<()> {
    require!(price > 0, EventTicketsError::InvalidPrice);
    require!(capacity > 0, EventTicketsError::InvalidCapacity);
    require!(ends_at > starts_at, EventTicketsError::InvalidTimeWindow);
    require!(name.len() <= MAX_NAME_LEN, EventTicketsError::MetadataTooLong);
    require!(symbol.len() <= MAX_SYMBOL_LEN, EventTicketsError::MetadataTooLong);
    require!(metadata_uri.len() <= MAX_URI_LEN, EventTicketsError::MetadataTooLong);

    let now = Clock::get()?.unix_timestamp;
    let event = &mut ctx.accounts.event;
    event.creator = ctx.accounts.creator.key();
    event.event_id = event_id;
    event.payment_mint = ctx.accounts.payment_mint.key();
    event.vault = ctx.accounts.vault.key();
    event.merkle_tree = Pubkey::default();
    event.price = price;
    event.capacity = capacity;
    event.sold = 0;
    event.starts_at = starts_at;
    event.ends_at = ends_at;
    event.total_revenue = 0;
    event.total_withdrawn = 0;
    event.status = EventStatus::Active;
    event.tree_initialised = false;
    event.name = name;
    event.symbol = symbol;
    event.metadata_uri = metadata_uri;
    event.created_at = now;
    event.updated_at = now;
    event.bump = ctx.bumps.event;
    event.vault_bump = ctx.bumps.vault;
    event.reserved = [0u8; 32];

    emit!(EventCreated {
        creator: event.creator,
        event_id,
        price,
        capacity,
        starts_at,
        ends_at,
        timestamp: now,
    });
    Ok(())
}
