use anchor_lang::prelude::*;

#[constant]
pub const CREATOR_SEED: &[u8] = b"creator";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

/// Upper bound on platform fee. 1_000 basis points = 10%.
pub const MAX_FEE_BPS: u16 = 1_000;

pub const BPS_DENOMINATOR: u64 = 10_000;
