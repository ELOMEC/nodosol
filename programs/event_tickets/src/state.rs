use anchor_lang::prelude::*;

use crate::constants::{
    MAX_NAME_LEN, MAX_SECTION_CODE_LEN, MAX_SYMBOL_LEN, MAX_TIER_NAME_LEN, MAX_URI_LEN,
};

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
    pub reserved: [u8; 64],
}

#[account]
#[derive(InitSpace)]
pub struct Event {
    pub creator: Pubkey,
    pub event_id: u64,
    pub payment_mint: Pubkey,
    pub vault: Pubkey,
    pub merkle_tree: Pubkey, // Pubkey::default() until initialise_event_tree runs
    pub price: u64,
    pub capacity: u64,
    pub sold: u64,
    pub starts_at: i64,
    pub ends_at: i64,
    pub total_revenue: u64,
    pub total_withdrawn: u64,
    pub status: EventStatus,
    pub tree_initialised: bool,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    #[max_len(MAX_SYMBOL_LEN)]
    pub symbol: String,
    #[max_len(MAX_URI_LEN)]
    pub metadata_uri: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
    pub reserved: [u8; 32],
}

impl Event {
    pub fn sale_open(&self, now: i64) -> bool {
        self.status == EventStatus::Active && now >= self.starts_at && now < self.ends_at
    }
    pub fn available(&self) -> u64 {
        self.capacity.saturating_sub(self.sold)
    }
    pub fn withdrawable(&self) -> u64 {
        self.total_revenue.saturating_sub(self.total_withdrawn)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum EventStatus {
    Active,
    Paused,
    Closed,
}

/// A pricing / seating category within an Event. Events may define zero or
/// many tiers; when ≥1 exists, buyers purchase from a specific tier and that
/// tier's per-seat price / capacity overrides the event-level defaults.
///
/// PDA seeds: `[b"tier", event_pubkey, tier_id_le]`.
#[account]
#[derive(InitSpace)]
pub struct TicketTier {
    pub event: Pubkey,
    pub tier_id: u16,
    pub price: u64,
    pub capacity: u32,
    pub sold: u32,
    /// Hex colour as ASCII without leading '#', e.g. b"FF5733".
    pub color_hex: [u8; 6],
    pub status: TierStatus,
    #[max_len(MAX_TIER_NAME_LEN)]
    pub name: String,
    /// Venue-facing section code that matches the SVG layout (e.g. "213", "Floor A").
    #[max_len(MAX_SECTION_CODE_LEN)]
    pub section_code: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
    pub reserved: [u8; 16],
}

impl TicketTier {
    pub fn available(&self) -> u32 {
        self.capacity.saturating_sub(self.sold)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum TierStatus {
    Active,
    Paused,
    Closed,
}
