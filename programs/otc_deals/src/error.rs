use anchor_lang::prelude::*;

#[error_code]
pub enum OtcError {
    #[msg("Only the config authority may perform this action")]
    Unauthorized,
    #[msg("Fee basis points exceed the maximum allowed")]
    FeeBpsTooHigh,
    #[msg("Treasury account mismatch")]
    TreasuryMismatch,
    #[msg("Seller and buyer must be distinct")]
    SelfDeal,
    #[msg("Quantity must be greater than zero")]
    InvalidQuantity,
    #[msg("Total price must be greater than zero")]
    InvalidPrice,
    #[msg("Expiry must be between 1 minute and 30 days from now")]
    InvalidExpiry,
    #[msg("Deal is not in the Proposed state")]
    DealNotProposed,
    #[msg("Deal has expired")]
    DealExpired,
    #[msg("Deal has not yet expired")]
    DealNotYetExpired,
    #[msg("Buyer does not match the deal counterparty")]
    BuyerMismatch,
    #[msg("Seller does not match the deal proposer")]
    SellerMismatch,
    #[msg("Asset mint mismatch")]
    AssetMintMismatch,
    #[msg("Payment mint mismatch")]
    PaymentMintMismatch,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
