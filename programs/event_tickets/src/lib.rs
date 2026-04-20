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

declare_id!("FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE");

#[program]
pub mod event_tickets {
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

    pub fn create_event(
        ctx: Context<CreateEvent>,
        event_id: u64,
        price: u64,
        capacity: u64,
        starts_at: i64,
        ends_at: i64,
        name: String,
        symbol: String,
        metadata_uri: String,
    ) -> Result<()> {
        handle_create_event(
            ctx,
            event_id,
            price,
            capacity,
            starts_at,
            ends_at,
            name,
            symbol,
            metadata_uri,
        )
    }

    pub fn initialize_event_tree(ctx: Context<InitializeEventTree>) -> Result<()> {
        handle_initialize_event_tree(ctx)
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        handle_buy_ticket(ctx)
    }

    pub fn withdraw_event_revenue(
        ctx: Context<WithdrawEventRevenue>,
        amount: u64,
    ) -> Result<()> {
        handle_withdraw_event_revenue(ctx, amount)
    }

    pub fn update_event_status(
        ctx: Context<UpdateEventStatus>,
        new_status: EventStatus,
    ) -> Result<()> {
        handle_update_event_status(ctx, new_status)
    }

    pub fn close_event(ctx: Context<CloseEvent>) -> Result<()> {
        handle_close_event(ctx)
    }
}
