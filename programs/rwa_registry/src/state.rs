use anchor_lang::prelude::*;

use crate::constants::{JURISDICTION_CODE_LEN, MAX_JURISDICTIONS, MAX_KYC_REF_LEN};

#[account]
#[derive(InitSpace)]
pub struct RegistryConfig {
    pub authority: Pubkey,
    pub issuer_count: u64,
    pub bump: u8,
    pub reserved: [u8; 63],
}

#[account]
#[derive(InitSpace)]
pub struct Issuer {
    pub owner: Pubkey,
    pub status: IssuerStatus,
    #[max_len(MAX_JURISDICTIONS, JURISDICTION_CODE_LEN)]
    pub jurisdictions: Vec<[u8; JURISDICTION_CODE_LEN]>,
    pub asset_classes: u16,
    #[max_len(MAX_KYC_REF_LEN)]
    pub kyc_ref: String,
    pub registered_at: i64,
    pub updated_at: i64,
    pub bump: u8,
    pub reserved: [u8; 32],
}

impl Issuer {
    pub fn is_active(&self) -> bool {
        matches!(self.status, IssuerStatus::Active)
    }

    pub fn supports_asset_class(&self, class_flag: u16) -> bool {
        (self.asset_classes & class_flag) == class_flag
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum IssuerStatus {
    Pending,
    Active,
    Suspended,
    Revoked,
}
