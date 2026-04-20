use anchor_lang::prelude::*;

use crate::state::IssuerStatus;

#[event]
pub struct RegistryInitialized {
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RegistryAuthorityUpdated {
    pub previous: Pubkey,
    pub next: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct IssuerRegistered {
    pub owner: Pubkey,
    pub status: IssuerStatus,
    pub asset_classes: u16,
    pub timestamp: i64,
}

#[event]
pub struct IssuerStatusChanged {
    pub owner: Pubkey,
    pub previous: IssuerStatus,
    pub next: IssuerStatus,
    pub timestamp: i64,
}

#[event]
pub struct IssuerMetadataUpdated {
    pub owner: Pubkey,
    pub asset_classes: u16,
    pub timestamp: i64,
}

#[event]
pub struct IssuerClosed {
    pub owner: Pubkey,
    pub timestamp: i64,
}
