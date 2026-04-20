use anchor_lang::prelude::*;

use crate::{
    constants::{
        ASSET_CLASSES_ALL, CONFIG_SEED, ISSUER_SEED, JURISDICTION_CODE_LEN, MAX_JURISDICTIONS,
        MAX_KYC_REF_LEN,
    },
    error::RegistryError,
    events::IssuerMetadataUpdated,
    state::{Issuer, RegistryConfig},
};

#[derive(Accounts)]
pub struct UpdateIssuerMetadata<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    #[account(
        mut,
        seeds = [ISSUER_SEED, issuer.owner.as_ref()],
        bump = issuer.bump,
    )]
    pub issuer: Account<'info, Issuer>,
}

pub fn handle_update_issuer_metadata(
    ctx: Context<UpdateIssuerMetadata>,
    jurisdictions: Vec<[u8; JURISDICTION_CODE_LEN]>,
    asset_classes: u16,
    kyc_ref: String,
) -> Result<()> {
    require!(
        jurisdictions.len() <= MAX_JURISDICTIONS,
        RegistryError::TooManyJurisdictions
    );
    for code in &jurisdictions {
        require!(
            code.iter().all(|b| b.is_ascii_uppercase()),
            RegistryError::InvalidJurisdictionCode
        );
    }
    require!(asset_classes != 0, RegistryError::NoAssetClasses);
    require!(
        (asset_classes & !ASSET_CLASSES_ALL) == 0,
        RegistryError::InvalidAssetClasses
    );
    require!(
        kyc_ref.len() <= MAX_KYC_REF_LEN,
        RegistryError::KycRefTooLong
    );

    let issuer = &mut ctx.accounts.issuer;
    issuer.jurisdictions = jurisdictions;
    issuer.asset_classes = asset_classes;
    issuer.kyc_ref = kyc_ref;
    issuer.updated_at = Clock::get()?.unix_timestamp;

    emit!(IssuerMetadataUpdated {
        owner: issuer.owner,
        asset_classes,
        timestamp: issuer.updated_at,
    });

    Ok(())
}
