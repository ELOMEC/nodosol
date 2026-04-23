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

declare_id!("8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Nodosol — Subscriptions",
    project_url: "https://nodosol.com",
    contacts: "email:security@nodosol.com,link:https://nodosol.com/security",
    policy: "https://nodosol.com/security",
    preferred_languages: "en",
    source_code: "https://github.com/ELOMEC/nodosol"
}

#[program]
pub mod subscription {
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

    pub fn create_plan(
        ctx: Context<CreatePlan>,
        plan_id: u64,
        price_per_period: u64,
        period_seconds: i64,
    ) -> Result<()> {
        handle_create_plan(ctx, plan_id, price_per_period, period_seconds)
    }

    pub fn subscribe(ctx: Context<Subscribe>, approve_amount: u64) -> Result<()> {
        handle_subscribe(ctx, approve_amount)
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        handle_cancel(ctx)
    }

    pub fn charge(ctx: Context<Charge>) -> Result<()> {
        handle_charge(ctx)
    }

    pub fn withdraw_plan_revenue(
        ctx: Context<WithdrawPlanRevenue>,
        amount: u64,
    ) -> Result<()> {
        handle_withdraw_plan_revenue(ctx, amount)
    }

    pub fn update_plan_status(
        ctx: Context<UpdatePlanStatus>,
        active: bool,
    ) -> Result<()> {
        handle_update_plan_status(ctx, active)
    }

    pub fn close_plan(ctx: Context<ClosePlan>) -> Result<()> {
        handle_close_plan(ctx)
    }
}
