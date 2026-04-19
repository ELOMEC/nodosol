use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Approve, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::{BPS_DENOMINATOR, CONFIG_SEED, PLAN_SEED, SUBSCRIPTION_SEED, VAULT_SEED},
    error::SubscriptionError,
    events::Subscribed,
    state::{Config, Subscription, SubscriptionPlan, SubscriptionStatus},
};

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub subscriber: Signer<'info>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = subscriber,
    )]
    pub subscriber_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [PLAN_SEED, plan.creator.as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
        has_one = mint @ SubscriptionError::Unauthorized,
        has_one = vault @ SubscriptionError::Unauthorized,
        constraint = plan.active @ SubscriptionError::PlanInactive,
    )]
    pub plan: Box<Account<'info, SubscriptionPlan>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, plan.key().as_ref()],
        bump = plan.vault_bump,
        token::mint = mint,
        token::authority = plan,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = subscriber,
        space = 8 + Subscription::INIT_SPACE,
        seeds = [SUBSCRIPTION_SEED, plan.key().as_ref(), subscriber.key().as_ref()],
        bump,
    )]
    pub subscription: Box<Account<'info, Subscription>>,

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
    pub system_program: Program<'info, System>,
}

pub fn handle_subscribe(ctx: Context<Subscribe>, approve_amount: u64) -> Result<()> {
    let price = ctx.accounts.plan.price_per_period;
    require!(
        approve_amount >= price,
        SubscriptionError::InsufficientApproveAmount
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // Subscriber grants the plan PDA delegate authority up to
    // approve_amount so future charges can pull without requiring a
    // second signature.
    let approve_cpi = Approve {
        to: ctx.accounts.subscriber_token_account.to_account_info(),
        delegate: ctx.accounts.plan.to_account_info(),
        authority: ctx.accounts.subscriber.to_account_info(),
    };
    token_interface::approve(
        CpiContext::new(ctx.accounts.token_program.key(), approve_cpi),
        approve_amount,
    )?;

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

    let next_charge_at = now
        .checked_add(ctx.accounts.plan.period_seconds)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;

    let subscription = &mut ctx.accounts.subscription;
    subscription.plan = ctx.accounts.plan.key();
    subscription.subscriber = ctx.accounts.subscriber.key();
    subscription.started_at = now;
    subscription.last_charged_at = now;
    subscription.next_charge_at = next_charge_at;
    subscription.charge_count = 1;
    subscription.total_paid = creator_amount;
    subscription.status = SubscriptionStatus::Active;
    subscription.cancelled_at = 0;
    subscription.bump = ctx.bumps.subscription;
    subscription.reserved = [0u8; 64];

    let plan = &mut ctx.accounts.plan;
    plan.subscriber_count = plan
        .subscriber_count
        .checked_add(1)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;
    plan.total_collected = plan
        .total_collected
        .checked_add(creator_amount)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;

    emit!(Subscribed {
        plan: plan.key(),
        subscription: subscription.key(),
        subscriber: subscription.subscriber,
        first_charge_amount: creator_amount,
        next_charge_at,
        timestamp: now,
    });

    Ok(())
}
