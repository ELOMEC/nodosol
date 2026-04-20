use anchor_lang::prelude::*;

#[error_code]
pub enum MarketplaceError {
    #[msg("Only the config authority may perform this action")]
    Unauthorized,
    #[msg("Fee basis points exceed the maximum allowed")]
    FeeBpsTooHigh,
    #[msg("Treasury account mismatch")]
    TreasuryMismatch,
    #[msg("Price per token must be greater than zero")]
    InvalidPrice,
    #[msg("Quantity must be greater than zero")]
    InvalidQuantity,
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Requested quantity exceeds remaining listing supply")]
    QuantityExceedsRemaining,
    #[msg("Listing still has unsold inventory — cancel before closing")]
    VaultNotEmpty,
    #[msg("Payment mint mismatch")]
    PaymentMintMismatch,
    #[msg("Asset mint mismatch")]
    AssetMintMismatch,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
