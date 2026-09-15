use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{EVENT_SEED, VAULT_SEED},
    error::EventTicketsError,
    events::EventRevenueWithdrawn,
    state::Event,
};

#[derive(Accounts)]
pub struct WithdrawEventRevenue<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [EVENT_SEED, creator.key().as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = creator @ EventTicketsError::NotCreator,
    )]
    pub event: Box<Account<'info, Event>>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, event.key().as_ref()],
        bump = event.vault_bump,
        token::mint = payment_mint,
        token::authority = event,
        token::token_program = payment_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = creator,
        token::token_program = payment_token_program,
    )]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw_event_revenue(
    ctx: Context<WithdrawEventRevenue>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, EventTicketsError::InvalidPrice);
    {
        let event = &ctx.accounts.event;
        let withdrawable = event.withdrawable();
        require!(amount <= withdrawable, EventTicketsError::ArithmeticOverflow);
    }

    let decimals = ctx.accounts.payment_mint.decimals;

    let creator_key = ctx.accounts.event.creator;
    let event_id_bytes = ctx.accounts.event.event_id.to_le_bytes();
    let event_bump = ctx.accounts.event.bump;
    let event_signer_seeds: &[&[u8]] = &[
        EVENT_SEED,
        creator_key.as_ref(),
        event_id_bytes.as_ref(),
        std::slice::from_ref(&event_bump),
    ];
    let signer_seeds_arr: &[&[&[u8]]] = &[event_signer_seeds];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.payment_mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.event.to_account_info(),
    };
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.payment_token_program.key(),
            cpi_accounts,
            signer_seeds_arr,
        ),
        amount,
        decimals,
    )?;

    let event_key = ctx.accounts.event.key();
    let event = &mut ctx.accounts.event;
    event.total_withdrawn = event
        .total_withdrawn
        .checked_add(amount)
        .ok_or(EventTicketsError::ArithmeticOverflow)?;
    let now = Clock::get()?.unix_timestamp;
    event.updated_at = now;

    emit!(EventRevenueWithdrawn {
        event: event_key,
        creator: creator_key,
        amount,
        total_withdrawn: event.total_withdrawn,
        timestamp: now,
    });
    Ok(())
}
