use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("Only the registry authority may perform this action")]
    Unauthorized,
    #[msg("Too many jurisdictions (max 8)")]
    TooManyJurisdictions,
    #[msg("Jurisdiction code must be exactly 3 ASCII uppercase bytes")]
    InvalidJurisdictionCode,
    #[msg("Asset classes bitmap contains unsupported flags")]
    InvalidAssetClasses,
    #[msg("Asset classes bitmap must be non-zero")]
    NoAssetClasses,
    #[msg("KYC reference string is too long")]
    KycRefTooLong,
    #[msg("Issuer status transition not allowed")]
    InvalidStatusTransition,
    #[msg("Issuer is not active")]
    IssuerNotActive,
}
