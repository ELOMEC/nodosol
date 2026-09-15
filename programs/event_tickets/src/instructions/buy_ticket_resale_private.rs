use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::AccountMeta, program::invoke_signed};
use solana_program::keccak;
use anchor_spl::{
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use mpl_bubblegum::instructions::{Transfer, TransferInstructionArgs};

use crate::{
    constants::{
        ACCOUNT_COMPRESSION_PROGRAM_ID, BPS_DENOMINATOR, BUBBLEGUM_PROGRAM_ID, CONFIG_SEED,
        NOOP_PROGRAM_ID, RESALE_SEED,
    },
    error::EventTicketsError,
    events::TicketResaleFilled,
    state::{Config, TicketResaleListing},
};

/// Buys a private-price listing by revealing the (price, nonce) pair
/// whose sha256 matches the commit stored on-chain. Other than taking
/// the reveal as args (and computing the hash to verify), the flow is
/// identical to the public buy — atomic USDC + cNFT swap.
///
/// The reveal lands in the transaction's instruction data, so after a
/// successful buy the price is permanently visible to anyone parsing
/// history. Privacy here is "pending" — the asking price is hidden
/// from the wider market until the first buyer accepts it.
#[derive(Accounts)]
pub struct BuyTicketResalePrivate<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: receives rent refund, must match listing.seller.
    #[account(mut, address = listing.seller @ EventTicketsError::NotSeller)]
    pub seller: UncheckedAccount<'info>,

    #[account(
        mut,
        close = seller,
        seeds = [RESALE_SEED, listing.merkle_tree.as_ref(), &listing.leaf_index.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Box<Account<'info, TicketResaleListing>>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

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
        address = config.treasury @ EventTicketsError::TreasuryMismatch,
        token::mint = payment_mint,
        token::token_program = payment_token_program,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,

    /// CHECK: Bubblegum derives and validates.
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: validated against listing.merkle_tree.
    #[account(
        mut,
        address = listing.merkle_tree @ EventTicketsError::ResaleTreeMismatch,
    )]
    pub merkle_tree: UncheckedAccount<'info>,

    /// CHECK: pinned Bubblegum program.
    #[account(address = BUBBLEGUM_PROGRAM_ID @ EventTicketsError::InvalidBubblegumProgram)]
    pub bubblegum_program: UncheckedAccount<'info>,

    /// CHECK: pinned Noop program.
    #[account(address = NOOP_PROGRAM_ID @ EventTicketsError::InvalidNoopProgram)]
    pub log_wrapper: UncheckedAccount<'info>,

    /// CHECK: pinned SPL Account Compression program.
    #[account(address = ACCOUNT_COMPRESSION_PROGRAM_ID @ EventTicketsError::InvalidCompressionProgram)]
    pub compression_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_buy_ticket_resale_private<'info>(
    ctx: Context<'info, BuyTicketResalePrivate<'info>>,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    revealed_price: u64,
    price_nonce: [u8; 32],
) -> Result<()> {
    require!(!ctx.accounts.config.paused, EventTicketsError::Paused);
    let now = Clock::get()?.unix_timestamp;

    {
        let listing = &ctx.accounts.listing;
        require!(listing.is_private(), EventTicketsError::ListingIsPublic);
        require!(
            listing.seller != ctx.accounts.buyer.key(),
            EventTicketsError::SellerCannotBuy
        );
        if listing.expires_at > 0 {
            require!(now < listing.expires_at, EventTicketsError::ResaleExpired);
        }
        require!(
            listing.payment_mint == ctx.accounts.payment_mint.key(),
            EventTicketsError::AssetMintMismatch
        );

        // Verify the reveal matches the stored commit.
        // Commit scheme: keccak256(price_le_bytes || 32-byte nonce).
        let computed = keccak::hashv(&[&revealed_price.to_le_bytes(), &price_nonce]);
        require!(
            computed.to_bytes() == listing.price_commit,
            EventTicketsError::PriceCommitMismatch
        );
    }

    let fee_bps = ctx.accounts.config.fee_bps as u64;
    let fee = revealed_price
        .checked_mul(fee_bps)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(EventTicketsError::ArithmeticOverflow)?;
    let seller_share = revealed_price
        .checked_sub(fee)
        .ok_or(EventTicketsError::ArithmeticOverflow)?;
    let decimals = ctx.accounts.payment_mint.decimals;

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
            decimals,
        )?;
    }

    {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.buyer_payment_account.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.seller_payment_account.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        transfer_checked(
            CpiContext::new(ctx.accounts.payment_token_program.key(), cpi_accounts),
            seller_share,
            decimals,
        )?;
    }

    // Bubblegum transfer: listing PDA → buyer, program-signed.
    let listing_key = ctx.accounts.listing.key();
    let seller_key = ctx.accounts.seller.key();
    let buyer_key = ctx.accounts.buyer.key();
    let merkle_tree_key = ctx.accounts.merkle_tree.key();
    let nonce = ctx.accounts.listing.nonce;
    let leaf_index = ctx.accounts.listing.leaf_index;
    let bump = ctx.accounts.listing.bump;
    let leaf_index_bytes = leaf_index.to_le_bytes();

    // Bubblegum `transfer` CPI via mpl-bubblegum 3.0.0 (P2-005).
    let proof_metas: Vec<AccountMeta> = ctx
        .remaining_accounts
        .iter()
        .map(|acc| AccountMeta::new_readonly(acc.key(), false))
        .collect();
    let ix = Transfer {
        tree_config: ctx.accounts.tree_config.key(),
        leaf_owner: (listing_key, true),
        leaf_delegate: (listing_key, true),
        new_leaf_owner: buyer_key,
        merkle_tree: merkle_tree_key,
        log_wrapper: ctx.accounts.log_wrapper.key(),
        compression_program: ctx.accounts.compression_program.key(),
        system_program: ctx.accounts.system_program.key(),
    }
    .instruction_with_remaining_accounts(
        TransferInstructionArgs {
            root,
            data_hash,
            creator_hash,
            nonce,
            index: leaf_index,
        },
        &proof_metas,
    );

    let mut infos: Vec<AccountInfo<'info>> = vec![
        ctx.accounts.tree_config.to_account_info(),
        ctx.accounts.listing.to_account_info(),
        ctx.accounts.listing.to_account_info(),
        ctx.accounts.buyer.to_account_info(),
        ctx.accounts.merkle_tree.to_account_info(),
        ctx.accounts.log_wrapper.to_account_info(),
        ctx.accounts.compression_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
    ];
    for acc in ctx.remaining_accounts.iter() {
        infos.push(acc.clone());
    }

    let signer_seeds: &[&[u8]] = &[
        RESALE_SEED,
        merkle_tree_key.as_ref(),
        leaf_index_bytes.as_ref(),
        std::slice::from_ref(&bump),
    ];

    invoke_signed(&ix, &infos, &[signer_seeds])?;

    emit!(TicketResaleFilled {
        listing: listing_key,
        seller: seller_key,
        buyer: buyer_key,
        merkle_tree: merkle_tree_key,
        leaf_index,
        price: revealed_price,
        timestamp: now,
    });
    Ok(())
}
