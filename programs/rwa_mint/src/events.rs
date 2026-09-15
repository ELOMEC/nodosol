use anchor_lang::prelude::*;

use crate::state::{AssetCategory, AssetStatus};

#[event]
pub struct AssetTokenized {
    pub issuer_owner: Pubkey,
    pub mint: Pubkey,
    pub asset_id: u64,
    pub category: AssetCategory,
    pub quantity: u64,
    pub delivery_required: bool,
    pub timestamp: i64,
}

#[event]
pub struct AssetTokensBurned {
    pub mint: Pubkey,
    pub amount: u64,
    pub remaining: u64,
    pub timestamp: i64,
}

#[event]
pub struct AssetStatusChanged {
    pub mint: Pubkey,
    pub previous: AssetStatus,
    pub next: AssetStatus,
    pub timestamp: i64,
}

#[event]
pub struct AssetClosed {
    pub mint: Pubkey,
    pub timestamp: i64,
}
