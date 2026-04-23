use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
    /// Emergency kill-switch. When true, all fund-moving instructions
    /// revert with `...Error::Paused`. Flipped by `update_pause`, which
    /// is authority-gated. Stored where the first byte of `reserved`
    /// used to live so existing on-chain accounts still deserialize
    /// cleanly (old bytes were zero → paused = false).
    pub paused: bool,
    pub reserved: [u8; 63],
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub asset_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub price_per_token: u64,
    pub initial_quantity: u64,
    pub remaining_quantity: u64,
    pub status: ListingStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
    pub reserved: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ListingStatus {
    Active,
    Cancelled,
    SoldOut,
}
