use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::{
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{
        ACCOUNT_COMPRESSION_PROGRAM_ID, BPS_DENOMINATOR, BUBBLEGUM_PROGRAM_ID, CONFIG_SEED,
        NOOP_PROGRAM_ID, RESALE_SEED,
    },
    error::EventTicketsError,
    events::TicketResaleFilled,
    instructions::list_ticket_resale::BUBBLEGUM_TRANSFER_DISCRIMINATOR,
    state::{Config, TicketResaleListing},
};

#[derive(Accounts)]
pub struct BuyTicketResale<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: receives the rent refund when the listing PDA is closed. The
    /// listing's `has_one` check binds this to `listing.seller`.
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

    // Bubblegum transfer accounts ---------------------------------------
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

pub fn handle_buy_ticket_resale<'info>(
    ctx: Context<'info, BuyTicketResale<'info>>,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
) -> Result<()> {
    require!(!ctx.accounts.config.paused, EventTicketsError::Paused);
    let now = Clock::get()?.unix_timestamp;

    {
        let listing = &ctx.accounts.listing;
        require!(!listing.is_private(), EventTicketsError::ListingIsPrivate);
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
    }

    let price = ctx.accounts.listing.price;
    let fee_bps = ctx.accounts.config.fee_bps as u64;
    let fee = price
        .checked_mul(fee_bps)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(EventTicketsError::ArithmeticOverflow)?;
    let seller_share = price
        .checked_sub(fee)
        .ok_or(EventTicketsError::ArithmeticOverflow)?;
    let decimals = ctx.accounts.payment_mint.decimals;

    // 1a. Platform fee: buyer → treasury (if > 0).
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

    // 1b. Seller share: buyer → seller ATA.
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

    // 2. Bubblegum transfer listing PDA → buyer. PDA signs.
    let listing_key = ctx.accounts.listing.key();
    let seller_key = ctx.accounts.seller.key();
    let buyer_key = ctx.accounts.buyer.key();
    let merkle_tree_key = ctx.accounts.merkle_tree.key();
    let nonce = ctx.accounts.listing.nonce;
    let leaf_index = ctx.accounts.listing.leaf_index;
    let bump = ctx.accounts.listing.bump;
    let leaf_index_bytes = leaf_index.to_le_bytes();

    let mut data = Vec::with_capacity(8 + 32 * 3 + 8 + 4);
    data.extend_from_slice(&BUBBLEGUM_TRANSFER_DISCRIMINATOR);
    data.extend_from_slice(&root);
    data.extend_from_slice(&data_hash);
    data.extend_from_slice(&creator_hash);
    data.extend_from_slice(&nonce.to_le_bytes());
    data.extend_from_slice(&leaf_index.to_le_bytes());

    let mut accounts = vec![
        AccountMeta::new(ctx.accounts.tree_config.key(), false),
        AccountMeta::new_readonly(listing_key, true), // leaf_owner = PDA, signer
        AccountMeta::new_readonly(listing_key, true), // leaf_delegate = PDA, signer
        AccountMeta::new_readonly(buyer_key, false), // new_leaf_owner = buyer
        AccountMeta::new(merkle_tree_key, false),
        AccountMeta::new_readonly(ctx.accounts.log_wrapper.key(), false),
        AccountMeta::new_readonly(ctx.accounts.compression_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    ];
    for acc in ctx.remaining_accounts.iter() {
        accounts.push(AccountMeta::new_readonly(acc.key(), false));
    }

    let ix = Instruction {
        program_id: BUBBLEGUM_PROGRAM_ID,
        accounts,
        data,
    };

    let mut infos: Vec<AccountInfo<'info>> = vec![
        ctx.accounts.tree_config.to_account_info(),
        ctx.accounts.listing.to_account_info(), // leaf_owner
        ctx.accounts.listing.to_account_info(), // leaf_delegate
        ctx.accounts.buyer.to_account_info(), // new_leaf_owner
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
        price,
        timestamp: now,
    });
    // `close = seller` on the listing account refunds rent.
    Ok(())
}
