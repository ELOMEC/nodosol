use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct CreatorProfile {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub elgamal_pubkey: [u8; 32],
    pub total_tips_amount: u64,
    pub total_tip_count: u64,
    pub total_withdrawn_amount: u64,
    pub created_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
    pub reserved: [u8; 64],
}

/// Global program config — singleton PDA at seeds=[b"config"].
/// Controls the platform fee split applied to every send_tip.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
    pub reserved: [u8; 64],
}
