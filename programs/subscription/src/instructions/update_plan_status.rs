use anchor_lang::prelude::*;

use crate::{
    constants::PLAN_SEED,
    error::SubscriptionError,
    events::PlanStatusUpdated,
    state::SubscriptionPlan,
};

#[derive(Accounts)]
pub struct UpdatePlanStatus<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [PLAN_SEED, creator.key().as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
        has_one = creator @ SubscriptionError::Unauthorized,
    )]
    pub plan: Account<'info, SubscriptionPlan>,
}

pub fn handle_update_plan_status(
    ctx: Context<UpdatePlanStatus>,
    active: bool,
) -> Result<()> {
    let plan = &mut ctx.accounts.plan;
    plan.active = active;

    emit!(PlanStatusUpdated {
        plan: plan.key(),
        creator: plan.creator,
        active,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
