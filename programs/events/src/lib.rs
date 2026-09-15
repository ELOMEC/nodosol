pub mod constants;
pub mod error;
pub mod events_log;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use events_log::*;
pub use instructions::*;
pub use state::*;

declare_id!("4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Nodosol — Events",
    project_url: "https://nodosol.com",
    contacts: "email:security@nodosol.com,link:https://nodosol.com/security",
    policy: "https://nodosol.com/security",
    preferred_languages: "en",
    source_code: "https://github.com/ELOMEC/nodosol"
}

#[program]
pub mod events {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        fee_bps: u16,
    ) -> Result<()> {
        handle_initialize_config(ctx, fee_bps)
    }

    pub fn update_fee_bps(ctx: Context<UpdateFeeBps>, new_fee_bps: u16) -> Result<()> {
        handle_update_fee_bps(ctx, new_fee_bps)
    }

    pub fn update_treasury(ctx: Context<UpdateTreasury>) -> Result<()> {
        handle_update_treasury(ctx)
    }

    pub fn update_config_authority(ctx: Context<UpdateConfigAuthority>) -> Result<()> {
        handle_update_authority(ctx)
    }

    pub fn update_pause(ctx: Context<UpdatePause>, paused: bool) -> Result<()> {
        handle_update_pause(ctx, paused)
    }

    pub fn create_event(
        ctx: Context<CreateEvent>,
        event_id: u64,
        price: u64,
        capacity: u64,
        starts_at: i64,
        ends_at: i64,
        metadata_uri: String,
    ) -> Result<()> {
        handle_create_event(ctx, event_id, price, capacity, starts_at, ends_at, metadata_uri)
    }

    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        handle_buy_ticket(ctx)
    }

    pub fn check_in(ctx: Context<CheckIn>) -> Result<()> {
        handle_check_in(ctx)
    }

    pub fn withdraw_revenue(ctx: Context<WithdrawRevenue>, amount: u64) -> Result<()> {
        handle_withdraw_revenue(ctx, amount)
    }

    pub fn update_event_status(
        ctx: Context<UpdateEventStatus>,
        active: bool,
    ) -> Result<()> {
        handle_update_event_status(ctx, active)
    }

    pub fn close_event(ctx: Context<CloseEvent>) -> Result<()> {
        handle_close_event(ctx)
    }
}
