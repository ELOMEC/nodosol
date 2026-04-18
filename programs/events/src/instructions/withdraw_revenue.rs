use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::{EVENT_SEED, VAULT_SEED},
    error::EventsError,
    events_log::RevenueWithdrawn,
    state::Event,
};

#[derive(Accounts)]
pub struct WithdrawRevenue<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [EVENT_SEED, creator.key().as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = creator @ EventsError::Unauthorized,
        has_one = mint @ EventsError::MintMismatch,
        has_one = vault @ EventsError::Unauthorized,
    )]
    pub event: Box<Account<'info, Event>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, event.key().as_ref()],
        bump = event.vault_bump,
        token::mint = mint,
        token::authority = event,
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

pub fn handle_withdraw_revenue(ctx: Context<WithdrawRevenue>, amount: u64) -> Result<()> {
    require!(amount > 0, EventsError::InvalidWithdrawAmount);
    require!(
        ctx.accounts.vault.amount >= amount,
        EventsError::InsufficientVaultBalance
    );

    let decimals = ctx.accounts.mint.decimals;
    let creator_key = ctx.accounts.event.creator;
    let event_id_bytes = ctx.accounts.event.event_id.to_le_bytes();
    let event_bump = ctx.accounts.event.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        EVENT_SEED,
        creator_key.as_ref(),
        &event_id_bytes,
        &[event_bump],
    ]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.event.to_account_info(),
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

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let event = &mut ctx.accounts.event;
    event.total_withdrawn = event
        .total_withdrawn
        .checked_add(amount)
        .ok_or(EventsError::ArithmeticOverflow)?;

    emit!(RevenueWithdrawn {
        event: event.key(),
        creator: creator_key,
        amount,
        total_withdrawn: event.total_withdrawn,
        timestamp: now,
    });

    Ok(())
}
