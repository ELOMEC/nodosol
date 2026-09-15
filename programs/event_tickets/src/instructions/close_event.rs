use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{close_account, CloseAccount},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{EVENT_SEED, VAULT_SEED},
    error::EventTicketsError,
    events::EventClosed,
    state::{Event, EventStatus},
};

#[derive(Accounts)]
pub struct CloseEvent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        close = creator,
        seeds = [EVENT_SEED, creator.key().as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = creator @ EventTicketsError::NotCreator,
        constraint = event.status == EventStatus::Closed @ EventTicketsError::InvalidStatusTransition,
        constraint = event.withdrawable() == 0 @ EventTicketsError::VaultNotEmpty,
    )]
    pub event: Box<Account<'info, Event>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, event.key().as_ref()],
        bump = event.vault_bump,
        token::mint = payment_mint,
        token::authority = event,
        token::token_program = payment_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_event(ctx: Context<CloseEvent>) -> Result<()> {
    require!(
        ctx.accounts.vault.amount == 0,
        EventTicketsError::VaultNotEmpty
    );

    let creator_key = ctx.accounts.event.creator;
    let event_id_bytes = ctx.accounts.event.event_id.to_le_bytes();
    let event_bump = ctx.accounts.event.bump;
    let signer_seeds: &[&[u8]] = &[
        EVENT_SEED,
        creator_key.as_ref(),
        event_id_bytes.as_ref(),
        std::slice::from_ref(&event_bump),
    ];
    let signer_seeds_arr: &[&[&[u8]]] = &[signer_seeds];

    let cpi_accounts = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.creator.to_account_info(),
        authority: ctx.accounts.event.to_account_info(),
    };
    close_account(CpiContext::new_with_signer(
        ctx.accounts.payment_token_program.key(),
        cpi_accounts,
        signer_seeds_arr,
    ))?;

    emit!(EventClosed {
        event: ctx.accounts.event.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
