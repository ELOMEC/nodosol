use anchor_lang::prelude::*;

#[constant]
pub const EVENT_SEED: &[u8] = b"event";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const TICKET_SEED: &[u8] = b"ticket";

/// Maximum length of the metadata URI (IPFS / Arweave link).
pub const MAX_METADATA_URI_LEN: usize = 200;

/// Sentinel value meaning "unlimited capacity".
pub const UNLIMITED_CAPACITY: u64 = 0;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

pub const MAX_FEE_BPS: u16 = 1_000;
pub const BPS_DENOMINATOR: u64 = 10_000;
