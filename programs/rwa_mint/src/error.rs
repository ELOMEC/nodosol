use anchor_lang::prelude::*;

#[error_code]
pub enum RwaMintError {
    #[msg("Issuer is not active")]
    IssuerNotActive,
    #[msg("Issuer is not authorised for this asset class")]
    AssetClassNotAuthorised,
    #[msg("Asset quantity must be greater than zero")]
    InvalidQuantity,
    #[msg("Metadata URI too long")]
    MetadataUriTooLong,
    #[msg("Name too long")]
    NameTooLong,
    #[msg("Symbol too long")]
    SymbolTooLong,
    #[msg("Mint has incorrect decimals for fungible RWA")]
    InvalidMintDecimals,
    #[msg("Mint authority does not match issuer")]
    MintAuthorityMismatch,
    #[msg("Mint already has tokens in circulation")]
    MintNotEmpty,
    #[msg("Asset status does not permit this operation")]
    AssetStatusInvalid,
    #[msg("Asset supply is still circulating")]
    SupplyStillCirculating,
    #[msg("Burn amount exceeds circulating supply")]
    BurnExceedsSupply,
    #[msg("Invalid status transition")]
    InvalidStatusTransition,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Unsupported asset category flag")]
    UnsupportedCategory,
}
