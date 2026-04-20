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
pub struct ListingCreated {
    pub seller: Pubkey,
    pub asset_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub price_per_token: u64,
    pub quantity: u64,
    pub timestamp: i64,
}

#[event]
pub struct ListingPriceUpdated {
    pub seller: Pubkey,
    pub asset_mint: Pubkey,
    pub previous_price: u64,
    pub next_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct ListingBought {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub asset_mint: Pubkey,
    pub quantity: u64,
    pub seller_share: u64,
    pub fee: u64,
    pub remaining_quantity: u64,
    pub timestamp: i64,
}

#[event]
pub struct ListingCancelled {
    pub seller: Pubkey,
    pub asset_mint: Pubkey,
    pub refunded_quantity: u64,
    pub timestamp: i64,
}
