use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::{CREATOR_SEED, VAULT_SEED},
    error::TipJarError,
    events::CreatorWithdrew,
    state::CreatorProfile,
};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [CREATOR_SEED, owner.key().as_ref()],
        bump = creator_profile.bump,
        has_one = owner @ TipJarError::Unauthorized,
        has_one = mint @ TipJarError::MintMismatch,
        has_one = vault,
    )]
    pub creator_profile: Account<'info, CreatorProfile>,

    #[account(
        mut,
        seeds = [VAULT_SEED, creator_profile.key().as_ref()],
        bump = creator_profile.vault_bump,
        token::mint = mint,
        token::authority = creator_profile,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, TipJarError::InvalidWithdrawAmount);
    require!(
        ctx.accounts.vault.amount >= amount,
        TipJarError::InsufficientVaultBalance
    );

    let decimals = ctx.accounts.mint.decimals;

    let owner_key = ctx.accounts.creator_profile.owner;
    let bump = ctx.accounts.creator_profile.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CREATOR_SEED, owner_key.as_ref(), &[bump]]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.creator_profile.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token_interface::transfer_checked(cpi_ctx, amount, decimals)?;

    let profile = &mut ctx.accounts.creator_profile;
    profile.total_withdrawn_amount = profile
        .total_withdrawn_amount
        .checked_add(amount)
        .ok_or(TipJarError::ArithmeticOverflow)?;

    emit!(CreatorWithdrew {
        creator: profile.owner,
        destination: ctx.accounts.destination.key(),
        amount,
        total_withdrawn_amount: profile.total_withdrawn_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
