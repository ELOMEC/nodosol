use anchor_lang::prelude::*;

#[error_code]
pub enum EventTicketsError {
    #[msg("Only the config authority may perform this action")]
    Unauthorized,
    #[msg("Fee basis points exceed the maximum allowed")]
    FeeBpsTooHigh,
    #[msg("Treasury account mismatch")]
    TreasuryMismatch,
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Capacity must be greater than zero")]
    InvalidCapacity,
    #[msg("Time window is invalid")]
    InvalidTimeWindow,
    #[msg("Event is not in the Active state")]
    EventNotActive,
    #[msg("Event is sold out")]
    SoldOut,
    #[msg("Sale has not started yet")]
    SaleNotStarted,
    #[msg("Sale has already ended")]
    SaleEnded,
    #[msg("Metadata string is too long")]
    MetadataTooLong,
    #[msg("Merkle tree address mismatch")]
    TreeMismatch,
    #[msg("Tree has already been initialised for this event")]
    TreeAlreadyInitialised,
    #[msg("Tree must be initialised before ticket sales")]
    TreeNotInitialised,
    #[msg("Asset mint mismatch")]
    AssetMintMismatch,
    #[msg("Vault still holds funds — withdraw before close")]
    VaultNotEmpty,
    #[msg("Only the creator may perform this action")]
    NotCreator,
    #[msg("Invalid status transition")]
    InvalidStatusTransition,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid Bubblegum program address")]
    InvalidBubblegumProgram,
    #[msg("Invalid SPL Account Compression program address")]
    InvalidCompressionProgram,
    #[msg("Invalid SPL Noop program address")]
    InvalidNoopProgram,
    #[msg("Tier does not belong to this event")]
    TierEventMismatch,
    #[msg("Tier is not in the Active state")]
    TierNotActive,
    #[msg("Tier is sold out")]
    TierSoldOut,
    #[msg("Tier name is too long")]
    TierNameTooLong,
    #[msg("Section code is too long")]
    SectionCodeTooLong,
    #[msg("New capacity cannot be below tickets already sold")]
    CapacityBelowSold,
    #[msg("Row label is too long")]
    RowLabelTooLong,
    #[msg("Resale listing is not active")]
    ResaleNotActive,
    #[msg("Resale listing has expired")]
    ResaleExpired,
    #[msg("Resale listing has not expired yet")]
    ResaleNotExpired,
    #[msg("Only the seller may perform this action")]
    NotSeller,
    #[msg("Seller cannot buy their own resale listing")]
    SellerCannotBuy,
    #[msg("Resale merkle tree does not match the listing")]
    ResaleTreeMismatch,
    #[msg("Revealed price does not match the listing commit")]
    PriceCommitMismatch,
    #[msg("Listing is in private-pricing mode — use buy_ticket_resale_private")]
    ListingIsPrivate,
    #[msg("Listing is in public-pricing mode — use buy_ticket_resale")]
    ListingIsPublic,
    #[msg("Program is paused — fund-moving instructions are temporarily disabled")]
    Paused,
}
