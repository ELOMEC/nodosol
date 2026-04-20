pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT");

#[program]
pub mod rwa_registry {
    use super::*;

    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        handle_initialize_registry(ctx)
    }

    pub fn update_registry_authority(ctx: Context<UpdateRegistryAuthority>) -> Result<()> {
        handle_update_registry_authority(ctx)
    }

    pub fn register_issuer(
        ctx: Context<RegisterIssuer>,
        owner: Pubkey,
        jurisdictions: Vec<[u8; JURISDICTION_CODE_LEN]>,
        asset_classes: u16,
        kyc_ref: String,
        initial_status: IssuerStatus,
    ) -> Result<()> {
        handle_register_issuer(ctx, owner, jurisdictions, asset_classes, kyc_ref, initial_status)
    }

    pub fn update_issuer_status(
        ctx: Context<UpdateIssuerStatus>,
        new_status: IssuerStatus,
    ) -> Result<()> {
        handle_update_issuer_status(ctx, new_status)
    }

    pub fn update_issuer_metadata(
        ctx: Context<UpdateIssuerMetadata>,
        jurisdictions: Vec<[u8; JURISDICTION_CODE_LEN]>,
        asset_classes: u16,
        kyc_ref: String,
    ) -> Result<()> {
        handle_update_issuer_metadata(ctx, jurisdictions, asset_classes, kyc_ref)
    }

    pub fn close_issuer(ctx: Context<CloseIssuer>) -> Result<()> {
        handle_close_issuer(ctx)
    }
}
