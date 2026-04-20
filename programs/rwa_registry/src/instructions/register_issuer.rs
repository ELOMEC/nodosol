use anchor_lang::prelude::*;

use crate::{
    constants::{
        ASSET_CLASSES_ALL, CONFIG_SEED, ISSUER_SEED, JURISDICTION_CODE_LEN, MAX_JURISDICTIONS,
        MAX_KYC_REF_LEN,
    },
    error::RegistryError,
    events::IssuerRegistered,
    state::{Issuer, IssuerStatus, RegistryConfig},
};

#[derive(Accounts)]
#[instruction(owner: Pubkey)]
pub struct RegisterIssuer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub config: Account<'info, RegistryConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + Issuer::INIT_SPACE,
        seeds = [ISSUER_SEED, owner.as_ref()],
        bump,
    )]
    pub issuer: Account<'info, Issuer>,

    pub system_program: Program<'info, System>,
}

pub fn handle_register_issuer(
    ctx: Context<RegisterIssuer>,
    owner: Pubkey,
    jurisdictions: Vec<[u8; JURISDICTION_CODE_LEN]>,
    asset_classes: u16,
    kyc_ref: String,
    initial_status: IssuerStatus,
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

    let now = Clock::get()?.unix_timestamp;
    let issuer = &mut ctx.accounts.issuer;
    issuer.owner = owner;
    issuer.status = initial_status;
    issuer.jurisdictions = jurisdictions;
    issuer.asset_classes = asset_classes;
    issuer.kyc_ref = kyc_ref;
    issuer.registered_at = now;
    issuer.updated_at = now;
    issuer.bump = ctx.bumps.issuer;
    issuer.reserved = [0u8; 32];

    let config = &mut ctx.accounts.config;
    config.issuer_count = config
        .issuer_count
        .checked_add(1)
        .ok_or(RegistryError::InvalidStatusTransition)?;

    emit!(IssuerRegistered {
        owner,
        status: initial_status,
        asset_classes,
        timestamp: now,
    });

    Ok(())
}
