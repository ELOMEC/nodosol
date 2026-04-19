use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{MAX_PERIOD_SECONDS, MIN_PERIOD_SECONDS, PLAN_SEED, VAULT_SEED},
    error::SubscriptionError,
    events::PlanCreated,
    state::SubscriptionPlan,
};

#[derive(Accounts)]
#[instruction(plan_id: u64, price_per_period: u64, period_seconds: i64)]
pub struct CreatePlan<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + SubscriptionPlan::INIT_SPACE,
        seeds = [PLAN_SEED, creator.key().as_ref(), &plan_id.to_le_bytes()],
        bump,
    )]
    pub plan: Account<'info, SubscriptionPlan>,

    #[account(
        init,
        payer = creator,
        seeds = [VAULT_SEED, plan.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = plan,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_plan(
    ctx: Context<CreatePlan>,
    plan_id: u64,
    price_per_period: u64,
    period_seconds: i64,
) -> Result<()> {
    require!(price_per_period > 0, SubscriptionError::InvalidPrice);
    require!(
        (MIN_PERIOD_SECONDS..=MAX_PERIOD_SECONDS).contains(&period_seconds),
        SubscriptionError::InvalidPeriod
    );

    let clock = Clock::get()?;
    let plan = &mut ctx.accounts.plan;

    plan.creator = ctx.accounts.creator.key();
    plan.mint = ctx.accounts.mint.key();
    plan.vault = ctx.accounts.vault.key();
    plan.plan_id = plan_id;
    plan.price_per_period = price_per_period;
    plan.period_seconds = period_seconds;
    plan.active = true;
    plan.subscriber_count = 0;
    plan.total_collected = 0;
    plan.total_withdrawn = 0;
    plan.created_at = clock.unix_timestamp;
    plan.bump = ctx.bumps.plan;
    plan.vault_bump = ctx.bumps.vault;
    plan.reserved = [0u8; 64];

    emit!(PlanCreated {
        plan: plan.key(),
        creator: plan.creator,
        mint: plan.mint,
        plan_id,
        price_per_period,
        period_seconds,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
