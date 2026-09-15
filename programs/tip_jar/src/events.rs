use anchor_lang::prelude::*;

#[event]
pub struct CreatorInitialized {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TipSent {
    pub tipper: Pubkey,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub total_tips_amount: u64,
    pub total_tip_count: u64,
    pub timestamp: i64,
}

#[event]
pub struct CreatorWithdrew {
    pub creator: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub total_withdrawn_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ElgamalPubkeyUpdated {
    pub creator: Pubkey,
    pub new_pubkey: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct CreatorProfileClosed {
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

#[event]
pub struct PauseUpdated {
    pub authority: Pubkey,
    pub paused: bool,
    pub timestamp: i64,
}
