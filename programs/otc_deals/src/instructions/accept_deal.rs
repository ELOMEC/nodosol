use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{BPS_DENOMINATOR, CONFIG_SEED, DEAL_SEED, VAULT_SEED},
    error::OtcError,
    events::DealAccepted,
    state::{Config, Deal, DealStatus},
};

#[derive(Accounts)]
pub struct AcceptDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), deal.buyer.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        constraint = deal.buyer == buyer.key() @ OtcError::BuyerMismatch,
        constraint = deal.asset_mint == asset_mint.key() @ OtcError::AssetMintMismatch,
        constraint = deal.payment_mint == payment_mint.key() @ OtcError::PaymentMintMismatch,
    )]
    pub deal: Box<Account<'info, Deal>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, deal.key().as_ref()],
        bump = deal.vault_bump,
        token::mint = asset_mint,
        token::authority = deal,
        token::token_program = asset_token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = asset_mint,
        associated_token::authority = buyer,
        associated_token::token_program = asset_token_program,
    )]
    pub buyer_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = buyer,
        token::token_program = payment_token_program,
    )]
    pub buyer_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::token_program = payment_token_program,
    )]
    pub seller_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        address = config.treasury @ OtcError::TreasuryMismatch,
        token::mint = payment_mint,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    pub asset_token_program: Interface<'info, TokenInterface>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_accept_deal(ctx: Context<AcceptDeal>) -> Result<()> {
    require!(!ctx.accounts.config.paused, OtcError::Paused);
    let deal = &mut ctx.accounts.deal;
    require!(
        deal.status == DealStatus::Proposed,
        OtcError::DealNotProposed
    );

    let now = Clock::get()?.unix_timestamp;
    require!(now <= deal.expires_at, OtcError::DealExpired);

    let fee = deal
        .total_price
        .checked_mul(ctx.accounts.config.fee_bps as u64)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(OtcError::ArithmeticOverflow)?;
    let seller_share = deal
        .total_price
        .checked_sub(fee)
        .ok_or(OtcError::ArithmeticOverflow)?;

    let payment_decimals = ctx.accounts.payment_mint.decimals;
    let asset_decimals = ctx.accounts.asset_mint.decimals;

    if fee > 0 {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.buyer_payment_account.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        transfer_checked(
            CpiContext::new(ctx.accounts.payment_token_program.key(), cpi_accounts),
            fee,
            payment_decimals,
        )?;
    }

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.buyer_payment_account.to_account_info(),
        mint: ctx.accounts.payment_mint.to_account_info(),
        to: ctx.accounts.seller_payment_account.to_account_info(),
        authority: ctx.accounts.buyer.to_account_info(),
    };
    transfer_checked(
        CpiContext::new(ctx.accounts.payment_token_program.key(), cpi_accounts),
        seller_share,
        payment_decimals,
    )?;

    // Vault releases asset tokens to buyer.
    let seller_key = deal.seller;
    let buyer_key = deal.buyer;
    let deal_id_bytes = deal.deal_id.to_le_bytes();
    let deal_bump = deal.bump;
    let deal_signer_seeds: &[&[u8]] = &[
        DEAL_SEED,
        seller_key.as_ref(),
        buyer_key.as_ref(),
        deal_id_bytes.as_ref(),
        std::slice::from_ref(&deal_bump),
    ];
    let signer_seeds_arr: &[&[&[u8]]] = &[deal_signer_seeds];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.asset_mint.to_account_info(),
        to: ctx.accounts.buyer_asset_account.to_account_info(),
        authority: deal.to_account_info(),
    };
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.asset_token_program.key(),
            cpi_accounts,
            signer_seeds_arr,
        ),
        deal.quantity,
        asset_decimals,
    )?;

    deal.status = DealStatus::Accepted;
    deal.updated_at = now;

    emit!(DealAccepted {
        buyer: ctx.accounts.buyer.key(),
        seller: deal.seller,
        asset_mint: deal.asset_mint,
        deal_id: deal.deal_id,
        quantity: deal.quantity,
        seller_share,
        fee,
        timestamp: now,
    });
    Ok(())
}
