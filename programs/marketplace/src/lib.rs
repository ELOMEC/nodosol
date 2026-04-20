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

declare_id!("69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ");

#[program]
pub mod marketplace {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, fee_bps: u16) -> Result<()> {
        handle_initialize_config(ctx, fee_bps)
    }

    pub fn update_fee_bps(ctx: Context<UpdateFeeBps>, new_fee_bps: u16) -> Result<()> {
        handle_update_fee_bps(ctx, new_fee_bps)
    }

    pub fn update_treasury(ctx: Context<UpdateTreasury>) -> Result<()> {
        handle_update_treasury(ctx)
    }

    pub fn update_config_authority(ctx: Context<UpdateConfigAuthority>) -> Result<()> {
        handle_update_config_authority(ctx)
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        price_per_token: u64,
        quantity: u64,
    ) -> Result<()> {
        handle_create_listing(ctx, price_per_token, quantity)
    }

    pub fn update_listing_price(
        ctx: Context<UpdateListingPrice>,
        new_price: u64,
    ) -> Result<()> {
        handle_update_listing_price(ctx, new_price)
    }

    pub fn buy_listing(ctx: Context<BuyListing>, quantity: u64) -> Result<()> {
        handle_buy_listing(ctx, quantity)
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        handle_cancel_listing(ctx)
    }
}
