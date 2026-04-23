use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SubscriptionPlan {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub plan_id: u64,
    pub price_per_period: u64,
    pub period_seconds: i64,
    pub active: bool,
    pub subscriber_count: u64,
    pub total_collected: u64,
    pub total_withdrawn: u64,
    pub created_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
    pub reserved: [u8; 64],
}

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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum SubscriptionStatus {
    Active,
    Cancelled,
    Expired,
}

#[account]
#[derive(InitSpace)]
pub struct Subscription {
    pub plan: Pubkey,
    pub subscriber: Pubkey,
    pub started_at: i64,
    pub last_charged_at: i64,
    pub next_charge_at: i64,
    pub charge_count: u64,
    pub total_paid: u64,
    pub status: SubscriptionStatus,
    pub cancelled_at: i64,
    pub bump: u8,
    pub reserved: [u8; 64],
}
