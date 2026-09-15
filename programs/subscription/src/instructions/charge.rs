use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::{BPS_DENOMINATOR, CONFIG_SEED, PLAN_SEED, SUBSCRIPTION_SEED, VAULT_SEED},
    error::SubscriptionError,
    events::SubscriptionCharged,
    state::{Config, Subscription, SubscriptionPlan, SubscriptionStatus},
};

#[derive(Accounts)]
pub struct Charge<'info> {
    /// Permissionless crank — anyone can pay the tx fee and trigger a
    /// due charge. No authority is granted to this signer beyond
    /// nudging the on-chain state forward.
    pub cranker: Signer<'info>,

    #[account(
        mut,
        seeds = [PLAN_SEED, plan.creator.as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
        has_one = mint @ SubscriptionError::Unauthorized,
        has_one = vault @ SubscriptionError::Unauthorized,
    )]
    pub plan: Box<Account<'info, SubscriptionPlan>>,

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
    pub subscription: Box<Account<'info, Subscription>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = subscription.subscriber,
    )]
    pub subscriber_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, plan.key().as_ref()],
        bump = plan.vault_bump,
        token::mint = mint,
        token::authority = plan,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        address = config.treasury @ SubscriptionError::TreasuryMismatch,
        token::mint = mint,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_charge(ctx: Context<Charge>) -> Result<()> {
    require!(!ctx.accounts.config.paused, SubscriptionError::Paused);
    require!(
        ctx.accounts.subscription.status == SubscriptionStatus::Active,
        SubscriptionError::SubscriptionNotActive
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    require!(
        now >= ctx.accounts.subscription.next_charge_at,
        SubscriptionError::PeriodNotElapsed
    );

    let price = ctx.accounts.plan.price_per_period;
    let decimals = ctx.accounts.mint.decimals;

    let creator_key = ctx.accounts.plan.creator;
    let plan_id_bytes = ctx.accounts.plan.plan_id.to_le_bytes();
    let plan_bump = ctx.accounts.plan.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        PLAN_SEED,
        creator_key.as_ref(),
        &plan_id_bytes,
        &[plan_bump],
    ]];

    let fee_bps = ctx.accounts.config.fee_bps as u64;
    let fee = price
        .checked_mul(fee_bps)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(SubscriptionError::ArithmeticOverflow)?;
    let creator_amount = price
        .checked_sub(fee)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;

    if fee > 0 {
        let fee_cpi = TransferChecked {
            from: ctx.accounts.subscriber_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.plan.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                fee_cpi,
                signer_seeds,
            ),
            fee,
            decimals,
        )?;
    }

    let creator_cpi = TransferChecked {
        from: ctx.accounts.subscriber_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.plan.to_account_info(),
    };
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            creator_cpi,
            signer_seeds,
        ),
        creator_amount,
        decimals,
    )?;

    let period = ctx.accounts.plan.period_seconds;
    let next_charge_at = ctx
        .accounts
        .subscription
        .next_charge_at
        .checked_add(period)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;

    let subscription = &mut ctx.accounts.subscription;
    subscription.last_charged_at = now;
    subscription.next_charge_at = next_charge_at;
    subscription.charge_count = subscription
        .charge_count
        .checked_add(1)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;
    subscription.total_paid = subscription
        .total_paid
        .checked_add(creator_amount)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;

    let charge_count = subscription.charge_count;
    let total_paid = subscription.total_paid;
    let subscription_key = subscription.key();
    let subscriber = subscription.subscriber;

    let plan = &mut ctx.accounts.plan;
    plan.total_collected = plan
        .total_collected
        .checked_add(creator_amount)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;

    emit!(SubscriptionCharged {
        plan: plan.key(),
        subscription: subscription_key,
        subscriber,
        amount: creator_amount,
        charge_count,
        total_paid,
        next_charge_at,
        timestamp: now,
    });

    Ok(())
}
