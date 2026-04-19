use anchor_lang::prelude::*;

#[event]
pub struct EventCreated {
    pub event: Pubkey,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub event_id: u64,
    pub price: u64,
    pub capacity: u64,
    pub starts_at: i64,
    pub ends_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct TicketPurchased {
    pub event: Pubkey,
    pub ticket: Pubkey,
    pub attendee: Pubkey,
    pub ticket_number: u64,
    pub price_paid: u64,
    pub timestamp: i64,
}

#[event]
pub struct TicketCheckedIn {
    pub event: Pubkey,
    pub ticket: Pubkey,
    pub attendee: Pubkey,
    pub checked_in_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RevenueWithdrawn {
    pub event: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
    pub total_withdrawn: u64,
    pub timestamp: i64,
}

#[event]
pub struct EventStatusUpdated {
    pub event: Pubkey,
    pub creator: Pubkey,
    pub active: bool,
    pub timestamp: i64,
}

#[event]
pub struct EventClosed {
    pub event: Pubkey,
    pub creator: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct FeeBpsUpdated {
    pub previous_bps: u16,
    pub new_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct TreasuryUpdated {
    pub previous_treasury: Pubkey,
    pub new_treasury: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ConfigAuthorityUpdated {
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp: i64,
}
