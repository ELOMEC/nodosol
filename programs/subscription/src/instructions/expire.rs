use anchor_lang::prelude::*;

use crate::{
    constants::{EXPIRE_GRACE_SECONDS, PLAN_SEED, SUBSCRIPTION_SEED},
    error::SubscriptionError,
    events::SubscriptionExpired,
    state::{Subscription, SubscriptionPlan, SubscriptionStatus},
};

#[derive(Accounts)]
pub struct Expire<'info> {
    /// Permissionless crank — anyone can pay the tx fee. No authority
    /// is granted beyond moving stuck state forward.
    pub cranker: Signer<'info>,

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

pub fn handle_expire(ctx: Context<Expire>) -> Result<()> {
    require!(
        ctx.accounts.subscription.status == SubscriptionStatus::Active,
        SubscriptionError::SubscriptionNotActive
    );

    let now = Clock::get()?.unix_timestamp;
    let next_charge = ctx.accounts.subscription.next_charge_at;
    let expire_at = next_charge
        .checked_add(EXPIRE_GRACE_SECONDS)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;

    require!(now >= expire_at, SubscriptionError::ExpireGraceNotElapsed);

    let subscriber = ctx.accounts.subscription.subscriber;
    let charge_count = ctx.accounts.subscription.charge_count;
    let total_paid = ctx.accounts.subscription.total_paid;

    let subscription = &mut ctx.accounts.subscription;
    subscription.status = SubscriptionStatus::Expired;
    subscription.cancelled_at = now;

    let plan = &mut ctx.accounts.plan;
    plan.subscriber_count = plan.subscriber_count.saturating_sub(1);

    emit!(SubscriptionExpired {
        plan: plan.key(),
        subscription: subscription.key(),
        subscriber,
        expired_by: ctx.accounts.cranker.key(),
        charge_count,
        total_paid,
        timestamp: now,
    });

    Ok(())
}
