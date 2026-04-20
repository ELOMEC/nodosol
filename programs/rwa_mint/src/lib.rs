pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU");

#[program]
pub mod rwa_mint {
    use super::*;

    pub fn tokenize_asset(
        ctx: Context<TokenizeAsset>,
        asset_id: u64,
        category: AssetCategory,
        quantity: u64,
        delivery_required: bool,
        name: String,
        symbol: String,
        metadata_uri: String,
    ) -> Result<()> {
        handle_tokenize_asset(
            ctx,
            asset_id,
            category,
            quantity,
            delivery_required,
            name,
            symbol,
            metadata_uri,
        )
    }

    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        handle_burn_tokens(ctx, amount)
    }

    pub fn update_asset_status(
        ctx: Context<UpdateAssetStatus>,
        new_status: AssetStatus,
    ) -> Result<()> {
        handle_update_asset_status(ctx, new_status)
    }

    pub fn close_asset(ctx: Context<CloseAsset>) -> Result<()> {
        handle_close_asset(ctx)
    }
}
