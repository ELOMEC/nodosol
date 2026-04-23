use anchor_lang::prelude::*;

#[error_code]
pub enum AuctionsError {
    #[msg("Only the config authority may perform this action")]
    Unauthorized,
    #[msg("Fee basis points exceed the maximum allowed")]
    FeeBpsTooHigh,
    #[msg("Treasury account mismatch")]
    TreasuryMismatch,

    #[msg("Commit deadline must be in the future")]
    InvalidCommitDeadline,
    #[msg("Reveal deadline must be after the commit deadline")]
    InvalidRevealDeadline,
    #[msg("Minimum deposit must be greater than zero")]
    InvalidMinDeposit,

    #[msg("Auction is not in the commit phase")]
    NotCommitPhase,
    #[msg("Auction is not in the reveal phase")]
    NotRevealPhase,
    #[msg("Auction reveal phase has not ended yet")]
    NotSettlePhase,
    #[msg("Auction is already settled or cancelled")]
    AuctionClosed,

    #[msg("Seller cannot bid on their own auction")]
    SellerCannotBid,
    #[msg("Deposit is below the auction minimum")]
    DepositBelowMinimum,
    #[msg("Revealed bid exceeds the escrow deposited at commit")]
    BidExceedsEscrow,
    #[msg("Revealed bid is below the auction start price")]
    BidBelowStartPrice,
    #[msg("Revealed bid does not match the stored commit")]
    BidCommitMismatch,

    #[msg("Bid is not in the expected state for this action")]
    InvalidBidState,
    #[msg("Only the original bidder may refund this escrow")]
    NotBidder,
    #[msg("Winning bidder cannot refund — they received the asset")]
    WinnerCannotRefund,

    #[msg("Cannot cancel an auction that already has committed bids")]
    HasBids,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Program is paused — fund-moving instructions are temporarily disabled")]
    Paused,
}
