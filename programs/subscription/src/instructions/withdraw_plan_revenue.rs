use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::{PLAN_SEED, VAULT_SEED},
    error::SubscriptionError,
    events::PlanRevenueWithdrawn,
    state::SubscriptionPlan,
};

#[derive(Accounts)]
pub struct WithdrawPlanRevenue<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [PLAN_SEED, creator.key().as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
        has_one = creator @ SubscriptionError::Unauthorized,
        has_one = mint @ SubscriptionError::Unauthorized,
        has_one = vault @ SubscriptionError::Unauthorized,
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
        mut,
        token::mint = mint,
    )]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw_plan_revenue(
    ctx: Context<WithdrawPlanRevenue>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, SubscriptionError::InvalidWithdrawAmount);
    require!(
        ctx.accounts.vault.amount >= amount,
        SubscriptionError::InsufficientVaultBalance
    );

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

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.plan.to_account_info(),
    };
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer_seeds,
        ),
        amount,
        decimals,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let plan = &mut ctx.accounts.plan;
    plan.total_withdrawn = plan
        .total_withdrawn
        .checked_add(amount)
        .ok_or(SubscriptionError::ArithmeticOverflow)?;

    emit!(PlanRevenueWithdrawn {
        plan: plan.key(),
        creator: creator_key,
        amount,
        total_withdrawn: plan.total_withdrawn,
        timestamp: now,
    });

    Ok(())
}
