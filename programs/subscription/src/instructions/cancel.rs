use anchor_lang::prelude::*;

use crate::{
    constants::{PLAN_SEED, SUBSCRIPTION_SEED},
    error::SubscriptionError,
    events::SubscriptionCancelled,
    state::{Subscription, SubscriptionPlan, SubscriptionStatus},
};

#[derive(Accounts)]
pub struct Cancel<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [PLAN_SEED, plan.creator.as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
    )]
    pub plan: Account<'info, SubscriptionPlan>,

    #[account(
        mut,
        seeds = [
            SUBSCRIPTION_SEED,
            plan.key().as_ref(),
            subscription.subscriber.as_ref(),
        ],
        bump = subscription.bump,
        constraint = subscription.plan == plan.key() @ SubscriptionError::Unauthorized,
    )]
    pub subscription: Account<'info, Subscription>,
}

pub fn handle_cancel(ctx: Context<Cancel>) -> Result<()> {
    require!(
        ctx.accounts.subscription.status == SubscriptionStatus::Active,
        SubscriptionError::SubscriptionNotActive
    );

    let signer_key = ctx.accounts.signer.key();
    let subscriber = ctx.accounts.subscription.subscriber;
    let creator = ctx.accounts.plan.creator;
    require!(
        signer_key == subscriber || signer_key == creator,
        SubscriptionError::Unauthorized
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let subscription = &mut ctx.accounts.subscription;
    subscription.status = SubscriptionStatus::Cancelled;
    subscription.cancelled_at = now;

    let plan = &mut ctx.accounts.plan;
    plan.subscriber_count = plan.subscriber_count.saturating_sub(1);

    emit!(SubscriptionCancelled {
        plan: plan.key(),
        subscription: subscription.key(),
        subscriber,
        cancelled_by: signer_key,
        timestamp: now,
    });

    Ok(())
}
