use anchor_lang::prelude::*;

use crate::constants::MAX_METADATA_URI_LEN;

#[account]
#[derive(InitSpace)]
pub struct Event {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub event_id: u64,
    pub price: u64,
    pub capacity: u64,
    pub sold_count: u64,
    pub checked_in_count: u64,
    pub starts_at: i64,
    pub ends_at: i64,
    pub active: bool,
    #[max_len(MAX_METADATA_URI_LEN)]
    pub metadata_uri: String,
    pub total_revenue: u64,
    pub total_withdrawn: u64,
    pub created_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
    pub reserved: [u8; 64],
}

#[account]
#[derive(InitSpace)]
pub struct Ticket {
    pub event: Pubkey,
    pub attendee: Pubkey,
    pub ticket_number: u64,
    pub price_paid: u64,
    pub purchased_at: i64,
    pub checked_in: bool,
    pub checked_in_at: i64,
    pub bump: u8,
    pub reserved: [u8; 32],
}
