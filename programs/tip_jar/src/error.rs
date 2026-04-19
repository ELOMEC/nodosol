use anchor_lang::prelude::*;

#[error_code]
pub enum TipJarError {
    #[msg("Unauthorized: signer is not the creator owner")]
    Unauthorized,
    #[msg("Tip amount must be greater than zero")]
    InvalidTipAmount,
    #[msg("Withdrawal amount must be greater than zero")]
    InvalidWithdrawAmount,
    #[msg("Vault balance is insufficient for this withdrawal")]
    InsufficientVaultBalance,
    #[msg("Destination token account mint does not match the creator profile mint")]
    MintMismatch,
    #[msg("Arithmetic overflow updating creator statistics")]
    ArithmeticOverflow,
    #[msg("Vault must be empty before the profile can be closed")]
    VaultNotEmpty,
    #[msg("Fee basis points exceed the maximum allowed")]
    FeeBpsTooHigh,
    #[msg("Treasury token account does not match the config")]
    TreasuryMismatch,
    #[msg("Treasury token account mint does not match")]
    TreasuryMintMismatch,
}
