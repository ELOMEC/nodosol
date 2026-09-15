use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface,
};

use crate::{
    constants::{EVENT_SEED, VAULT_SEED},
    error::EventsError,
    events_log::EventClosed,
    state::Event,
};

#[derive(Accounts)]
pub struct CloseEvent<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [EVENT_SEED, creator.key().as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = creator @ EventsError::Unauthorized,
        has_one = mint @ EventsError::MintMismatch,
        has_one = vault @ EventsError::Unauthorized,
        close = creator,
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

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_event(ctx: Context<CloseEvent>) -> Result<()> {
    require!(
        ctx.accounts.vault.amount == 0,
        EventsError::VaultNotEmpty
    );

    let creator_key = ctx.accounts.event.creator;
    let event_id_bytes = ctx.accounts.event.event_id.to_le_bytes();
    let event_bump = ctx.accounts.event.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        EVENT_SEED,
        creator_key.as_ref(),
        &event_id_bytes,
        &[event_bump],
    ]];

    let cpi_accounts = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.creator.to_account_info(),
        authority: ctx.accounts.event.to_account_info(),
    };
    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    ))?;

    emit!(EventClosed {
        event: ctx.accounts.event.key(),
        creator: creator_key,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
