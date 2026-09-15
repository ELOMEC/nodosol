use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{close_account, transfer_checked, CloseAccount, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{DEAL_SEED, VAULT_SEED},
    error::OtcError,
    events::DealCancelled,
    state::{Deal, DealStatus},
};

#[derive(Accounts)]
pub struct CancelDeal<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        close = seller,
        seeds = [DEAL_SEED, seller.key().as_ref(), deal.buyer.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        constraint = deal.seller == seller.key() @ OtcError::SellerMismatch,
        constraint = deal.asset_mint == asset_mint.key() @ OtcError::AssetMintMismatch,
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
        mut,
        token::mint = asset_mint,
        token::authority = seller,
        token::token_program = asset_token_program,
    )]
    pub seller_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub asset_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_cancel_deal(ctx: Context<CancelDeal>) -> Result<()> {
    let deal = &mut ctx.accounts.deal;
    require!(
        deal.status == DealStatus::Proposed,
        OtcError::DealNotProposed
    );

    let quantity = deal.quantity;
    let decimals = ctx.accounts.asset_mint.decimals;

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
        to: ctx.accounts.seller_asset_account.to_account_info(),
        authority: deal.to_account_info(),
    };
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.asset_token_program.key(),
            cpi_accounts,
            signer_seeds_arr,
        ),
        quantity,
        decimals,
    )?;

    let cpi_accounts = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.seller.to_account_info(),
        authority: deal.to_account_info(),
    };
    close_account(CpiContext::new_with_signer(
        ctx.accounts.asset_token_program.key(),
        cpi_accounts,
        signer_seeds_arr,
    ))?;

    deal.status = DealStatus::Cancelled;
    deal.updated_at = Clock::get()?.unix_timestamp;

    emit!(DealCancelled {
        seller: deal.seller,
        buyer: deal.buyer,
        deal_id: deal.deal_id,
        timestamp: deal.updated_at,
    });
    Ok(())
}
