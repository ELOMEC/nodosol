use anchor_lang::prelude::*;

use crate::{
    constants::{
        EVENT_SEED, MAX_SECTION_CODE_LEN, MAX_TIER_NAME_LEN, MAX_TIERS_PER_EVENT, TIER_SEED,
    },
    error::EventTicketsError,
    events::TierCreated,
    state::{Event, TicketTier, TierStatus},
};

#[derive(Accounts)]
#[instruction(tier_id: u16)]
pub struct CreateTier<'info> {
    #[account(
        mut,
        address = event.creator @ EventTicketsError::NotCreator,
    )]
    pub creator: Signer<'info>,

    #[account(
        seeds = [EVENT_SEED, event.creator.as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
    )]
    pub event: Box<Account<'info, Event>>,

    #[account(
        init,
        payer = creator,
        space = 8 + TicketTier::INIT_SPACE,
        seeds = [TIER_SEED, event.key().as_ref(), &tier_id.to_le_bytes()],
        bump,
    )]
    pub tier: Box<Account<'info, TicketTier>>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_tier(
    ctx: Context<CreateTier>,
    tier_id: u16,
    name: String,
    section_code: String,
    price: u64,
    capacity: u32,
    color_hex: [u8; 6],
) -> Result<()> {
    require!(tier_id < MAX_TIERS_PER_EVENT, EventTicketsError::InvalidCapacity);
    require!(price > 0, EventTicketsError::InvalidPrice);
    require!(capacity > 0, EventTicketsError::InvalidCapacity);
    require!(
        name.len() <= MAX_TIER_NAME_LEN,
        EventTicketsError::TierNameTooLong
    );
    require!(
        section_code.len() <= MAX_SECTION_CODE_LEN,
        EventTicketsError::SectionCodeTooLong
    );

    let now = Clock::get()?.unix_timestamp;
    let tier = &mut ctx.accounts.tier;
    tier.event = ctx.accounts.event.key();
    tier.tier_id = tier_id;
    tier.price = price;
    tier.capacity = capacity;
    tier.sold = 0;
    tier.color_hex = color_hex;
    tier.status = TierStatus::Active;
    tier.name = name;
    tier.section_code = section_code;
    tier.created_at = now;
    tier.updated_at = now;
    tier.bump = ctx.bumps.tier;
    tier.reserved = [0u8; 16];

    emit!(TierCreated {
        event: ctx.accounts.event.key(),
        tier: tier.key(),
        tier_id,
        price,
        capacity,
        timestamp: now,
    });
    Ok(())
}
