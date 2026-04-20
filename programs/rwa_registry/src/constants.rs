pub const CONFIG_SEED: &[u8] = b"config";
pub const ISSUER_SEED: &[u8] = b"issuer";

pub const MAX_JURISDICTIONS: usize = 8;
pub const JURISDICTION_CODE_LEN: usize = 3;
pub const MAX_KYC_REF_LEN: usize = 96;

pub const ASSET_CLASS_COMMODITY: u16 = 1 << 0;
pub const ASSET_CLASS_REAL_ESTATE: u16 = 1 << 1;
pub const ASSET_CLASS_DEBT: u16 = 1 << 2;
pub const ASSET_CLASS_EQUITY: u16 = 1 << 3;
pub const ASSET_CLASS_TICKET: u16 = 1 << 4;
pub const ASSET_CLASS_CARBON: u16 = 1 << 5;
pub const ASSET_CLASS_OTHER: u16 = 1 << 6;

pub const ASSET_CLASSES_ALL: u16 = ASSET_CLASS_COMMODITY
    | ASSET_CLASS_REAL_ESTATE
    | ASSET_CLASS_DEBT
    | ASSET_CLASS_EQUITY
    | ASSET_CLASS_TICKET
    | ASSET_CLASS_CARBON
    | ASSET_CLASS_OTHER;
