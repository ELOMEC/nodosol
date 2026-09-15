use anchor_lang::prelude::*;

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
pub struct PauseUpdated {
    pub authority: Pubkey,
    pub paused: bool,
    pub timestamp: i64,
}

#[event]
pub struct DealProposed {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub asset_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub deal_id: u64,
    pub quantity: u64,
    pub total_price: u64,
    pub expires_at: i64,
    pub memo_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct DealAccepted {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub asset_mint: Pubkey,
    pub deal_id: u64,
    pub quantity: u64,
    pub seller_share: u64,
    pub fee: u64,
    pub timestamp: i64,
}

#[event]
pub struct DealCancelled {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub deal_id: u64,
    pub timestamp: i64,
}

#[event]
pub struct DealExpired {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub deal_id: u64,
    pub timestamp: i64,
}
