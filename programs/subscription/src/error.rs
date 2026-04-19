use anchor_lang::prelude::*;

#[error_code]
pub enum SubscriptionError {
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Period is outside the allowed range")]
    InvalidPeriod,
    #[msg("Approved amount must cover at least one billing period")]
    InsufficientApproveAmount,
    #[msg("Plan is not accepting new subscribers")]
    PlanInactive,
    #[msg("Subscription is not active")]
    SubscriptionNotActive,
    #[msg("Unauthorized: signer may not perform this action")]
    Unauthorized,
    #[msg("Billing period has not elapsed yet")]
    PeriodNotElapsed,
    #[msg("Arithmetic overflow updating counters")]
    ArithmeticOverflow,
    #[msg("Clock value is invalid")]
    InvalidClock,
    #[msg("Withdrawal amount must be greater than zero")]
    InvalidWithdrawAmount,
    #[msg("Vault balance is insufficient for this withdrawal")]
    InsufficientVaultBalance,
    #[msg("Plan has active subscribers and cannot be closed")]
    PlanHasSubscribers,
    #[msg("Vault must be empty before the plan can be closed")]
    VaultNotEmpty,
}
