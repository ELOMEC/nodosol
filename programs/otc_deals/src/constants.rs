pub const CONFIG_SEED: &[u8] = b"config";
pub const DEAL_SEED: &[u8] = b"deal";
pub const VAULT_SEED: &[u8] = b"vault";

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_FEE_BPS: u16 = 1_000; // 10%
// Hard lower and upper bounds on deal validity window to avoid degenerate expiries.
pub const MIN_EXPIRY_OFFSET_SECS: i64 = 60; // 1 minute
pub const MAX_EXPIRY_OFFSET_SECS: i64 = 60 * 60 * 24 * 30; // 30 days
