use anchor_lang::prelude::*;

use crate::constants::{MAX_METADATA_URI_LEN, MAX_NAME_LEN, MAX_SYMBOL_LEN};

#[account]
#[derive(InitSpace)]
pub struct Asset {
    pub issuer_owner: Pubkey,
    pub mint: Pubkey,
    pub asset_id: u64,
    pub category: AssetCategory,
    pub status: AssetStatus,
    pub quantity: u64,
    pub burned_amount: u64,
    pub delivery_required: bool,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    #[max_len(MAX_SYMBOL_LEN)]
    pub symbol: String,
    #[max_len(MAX_METADATA_URI_LEN)]
    pub metadata_uri: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
    pub reserved: [u8; 63],
}

impl Asset {
    pub fn circulating_supply(&self) -> u64 {
        self.quantity.saturating_sub(self.burned_amount)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AssetCategory {
    Commodity,
    RealEstate,
    Debt,
    Equity,
    Ticket,
    Carbon,
    Other,
}

impl AssetCategory {
    pub fn as_flag(&self) -> u16 {
        use crate::AssetCategory::*;
        match self {
            Commodity => 1 << 0,
            RealEstate => 1 << 1,
            Debt => 1 << 2,
            Equity => 1 << 3,
            Ticket => 1 << 4,
            Carbon => 1 << 5,
            Other => 1 << 6,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AssetStatus {
    Active,
    Paused,
    Retired,
}
