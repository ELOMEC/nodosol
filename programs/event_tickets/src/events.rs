use anchor_lang::prelude::*;

use crate::state::EventStatus;

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct FeeBpsUpdated {
    pub previous: u16,
    pub next: u16,
    pub timestamp: i64,
}

#[event]
pub struct TreasuryUpdated {
    pub previous: Pubkey,
    pub next: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityUpdated {
    pub previous: Pubkey,
    pub next: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct EventCreated {
    pub creator: Pubkey,
    pub event_id: u64,
    pub price: u64,
    pub capacity: u64,
    pub starts_at: i64,
    pub ends_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct EventTreeInitialised {
    pub event: Pubkey,
    pub merkle_tree: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TicketMinted {
    pub event: Pubkey,
    pub buyer: Pubkey,
    pub merkle_tree: Pubkey,
    pub sold: u64,
    pub seller_share: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct EventRevenueWithdrawn {
    pub event: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
    pub total_withdrawn: u64,
    pub timestamp: i64,
}

#[event]
pub struct EventStatusChanged {
    pub event: Pubkey,
    pub previous: EventStatus,
    pub next: EventStatus,
    pub timestamp: i64,
}

#[event]
pub struct EventClosed {
    pub event: Pubkey,
    pub timestamp: i64,
}
