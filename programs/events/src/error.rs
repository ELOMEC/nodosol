use anchor_lang::prelude::*;

#[error_code]
pub enum EventsError {
    #[msg("Event is not currently accepting ticket sales")]
    EventInactive,
    #[msg("Event window has not opened yet")]
    EventNotStarted,
    #[msg("Event has already ended")]
    EventEnded,
    #[msg("Event is sold out")]
    CapacityReached,
    #[msg("Ticket has already been checked in")]
    AlreadyCheckedIn,
    #[msg("Ticket belongs to a different event")]
    TicketEventMismatch,
    #[msg("Invalid event date range (ends_at must be after starts_at)")]
    InvalidDates,
    #[msg("Metadata URI is empty or exceeds the maximum length")]
    InvalidMetadataUri,
    #[msg("Unauthorized: signer may not perform this action")]
    Unauthorized,
    #[msg("Withdrawal amount must be greater than zero")]
    InvalidWithdrawAmount,
    #[msg("Vault balance is insufficient for this withdrawal")]
    InsufficientVaultBalance,
    #[msg("Destination token account mint does not match the event mint")]
    MintMismatch,
    #[msg("Arithmetic overflow updating counters")]
    ArithmeticOverflow,
    #[msg("Vault must be empty before the event can be closed")]
    VaultNotEmpty,
    #[msg("Fee basis points exceed the maximum allowed")]
    FeeBpsTooHigh,
    #[msg("Treasury token account does not match the config")]
    TreasuryMismatch,
}
