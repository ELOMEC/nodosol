pub const CONFIG_SEED: &[u8] = b"config";
pub const AUCTION_SEED: &[u8] = b"auction";
pub const VAULT_SEED: &[u8] = b"vault";
pub const BID_SEED: &[u8] = b"bid";

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_FEE_BPS: u16 = 1_000; // 10% ceiling

pub const MAX_MEMO_LEN: usize = 140;
pub const MAX_URI_LEN: usize = 256;
