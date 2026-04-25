use anchor_lang::prelude::*;

#[constant]
pub const PLAN_SEED: &[u8] = b"plan";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";

/// Minimum billing period (1 hour). Guards against micro-spam and
/// floating-point-style rounding errors on clock drift.
#[constant]
pub const MIN_PERIOD_SECONDS: i64 = 3_600;

/// Maximum billing period (~2 years). Sanity bound; creators wanting
/// lifetime offers should use the tip_jar program or a one-shot NFT.
#[constant]
pub const MAX_PERIOD_SECONDS: i64 = 63_072_000;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

pub const MAX_FEE_BPS: u16 = 1_000;
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Grace period after `next_charge_at` before a permissionless caller
/// can expire a stuck subscription. 7 days lets a subscriber re-fund
/// their wallet or re-approve the delegate before the subscription is
/// marked Expired.
pub const EXPIRE_GRACE_SECONDS: i64 = 604_800;
