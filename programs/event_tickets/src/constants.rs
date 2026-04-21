use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const EVENT_SEED: &[u8] = b"event";
pub const VAULT_SEED: &[u8] = b"vault";
pub const TIER_SEED: &[u8] = b"tier";

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_FEE_BPS: u16 = 1_000; // 10%

pub const MAX_NAME_LEN: usize = 64;
pub const MAX_SYMBOL_LEN: usize = 16;
pub const MAX_URI_LEN: usize = 256;
pub const MAX_TIER_NAME_LEN: usize = 48;
pub const MAX_SECTION_CODE_LEN: usize = 16;
pub const MAX_ROW_LABEL_LEN: usize = 4;
pub const MAX_TIERS_PER_EVENT: u16 = 128;

// Tree sizing. max_depth=14 → 16,384 leaves. Rent stays reasonable per event.
pub const TREE_MAX_DEPTH: u32 = 14;
pub const TREE_MAX_BUFFER_SIZE: u32 = 64;
pub const TREE_CANOPY_DEPTH: u32 = 0;

// Pinned program IDs (Metaplex Bubblegum + SPL Account Compression + SPL Noop)
// — same addresses on devnet and mainnet.
pub const BUBBLEGUM_PROGRAM_ID: Pubkey = pubkey!("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
pub const ACCOUNT_COMPRESSION_PROGRAM_ID: Pubkey = pubkey!("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
pub const NOOP_PROGRAM_ID: Pubkey = pubkey!("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
