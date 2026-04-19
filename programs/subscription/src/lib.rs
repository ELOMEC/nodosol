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

#[program]
pub mod subscription {
    use super::*;

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
