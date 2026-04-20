use anchor_lang::prelude::*;

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
pub struct Deal {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub asset_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub deal_id: u64,
    pub quantity: u64,
    pub total_price: u64,
    pub status: DealStatus,
    pub expires_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub memo_hash: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
    pub reserved: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum DealStatus {
    Proposed,
    Accepted,
    Cancelled,
    Expired,
}
