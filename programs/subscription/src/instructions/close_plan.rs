use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface,
};

use crate::{
    constants::{PLAN_SEED, VAULT_SEED},
    error::SubscriptionError,
    events::PlanClosed,
    state::SubscriptionPlan,
};

#[derive(Accounts)]
pub struct ClosePlan<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [PLAN_SEED, creator.key().as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
        has_one = creator @ SubscriptionError::Unauthorized,
        has_one = mint @ SubscriptionError::Unauthorized,
        has_one = vault @ SubscriptionError::Unauthorized,
        close = creator,
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

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_plan(ctx: Context<ClosePlan>) -> Result<()> {
    require!(
        ctx.accounts.plan.subscriber_count == 0,
        SubscriptionError::PlanHasSubscribers
    );
    require!(
        ctx.accounts.vault.amount == 0,
        SubscriptionError::VaultNotEmpty
    );

    let creator_key = ctx.accounts.plan.creator;
    let plan_id_bytes = ctx.accounts.plan.plan_id.to_le_bytes();
    let plan_bump = ctx.accounts.plan.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        PLAN_SEED,
        creator_key.as_ref(),
        &plan_id_bytes,
        &[plan_bump],
    ]];

    let cpi_accounts = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.creator.to_account_info(),
        authority: ctx.accounts.plan.to_account_info(),
    };
    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    ))?;

    emit!(PlanClosed {
        plan: ctx.accounts.plan.key(),
        creator: creator_key,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
