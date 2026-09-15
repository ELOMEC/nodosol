use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::{
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use mpl_bubblegum::{
    instructions::{MintV1, MintV1InstructionArgs},
    types::{MetadataArgs, TokenProgramVersion, TokenStandard},
};

use crate::{
    constants::{
        ACCOUNT_COMPRESSION_PROGRAM_ID, BPS_DENOMINATOR, BUBBLEGUM_PROGRAM_ID, CONFIG_SEED,
        EVENT_SEED, NOOP_PROGRAM_ID, VAULT_SEED,
    },
    error::EventTicketsError,
    events::TicketMinted,
    state::{Config, Event, EventStatus},
};

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [EVENT_SEED, event.creator.as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
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

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = buyer,
        token::token_program = payment_token_program,
    )]
    pub buyer_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        address = config.treasury @ EventTicketsError::TreasuryMismatch,
        token::mint = payment_mint,
    )]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_token_program: Interface<'info, TokenInterface>,

    // Bubblegum mint_v1 accounts -----------------------------------------
    /// Bubblegum tree_config PDA.
    /// CHECK: Bubblegum validates.
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: buyer's leaf owner — same as buyer account.
    pub leaf_owner: UncheckedAccount<'info>,

    /// CHECK: delegate — we pass buyer too so owner == delegate.
    pub leaf_delegate: UncheckedAccount<'info>,

    /// Merkle tree account — validated against event.merkle_tree.
    /// CHECK: Bubblegum writes the leaf.
    #[account(
        mut,
        address = event.merkle_tree @ EventTicketsError::TreeMismatch,
    )]
    pub merkle_tree: UncheckedAccount<'info>,

    /// CHECK: pinned Bubblegum program address.
    #[account(address = BUBBLEGUM_PROGRAM_ID @ EventTicketsError::InvalidBubblegumProgram)]
    pub bubblegum_program: UncheckedAccount<'info>,

    /// CHECK: pinned SPL Noop program address.
    #[account(address = NOOP_PROGRAM_ID @ EventTicketsError::InvalidNoopProgram)]
    pub log_wrapper: UncheckedAccount<'info>,

    /// CHECK: pinned SPL Account Compression program address.
    #[account(address = ACCOUNT_COMPRESSION_PROGRAM_ID @ EventTicketsError::InvalidCompressionProgram)]
    pub compression_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
    require!(!ctx.accounts.config.paused, EventTicketsError::Paused);
    let now = Clock::get()?.unix_timestamp;

    {
        let event = &ctx.accounts.event;
        require!(
            event.status == EventStatus::Active,
            EventTicketsError::EventNotActive
        );
        require!(event.tree_initialised, EventTicketsError::TreeNotInitialised);
        require!(now >= event.starts_at, EventTicketsError::SaleNotStarted);
        require!(now < event.ends_at, EventTicketsError::SaleEnded);
        require!(event.available() > 0, EventTicketsError::SoldOut);
        require!(
            event.payment_mint == ctx.accounts.payment_mint.key(),
            EventTicketsError::AssetMintMismatch
        );
    }

    // --- Fee split: buyer -> vault (creator share) + treasury (platform) ---
    let price = ctx.accounts.event.price;
    let fee_bps = ctx.accounts.config.fee_bps as u64;
    let fee = price
        .checked_mul(fee_bps)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(EventTicketsError::ArithmeticOverflow)?;
    let creator_share = price.checked_sub(fee).ok_or(EventTicketsError::ArithmeticOverflow)?;
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

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.buyer_payment_account.to_account_info(),
        mint: ctx.accounts.payment_mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.buyer.to_account_info(),
    };
    transfer_checked(
        CpiContext::new(ctx.accounts.payment_token_program.key(), cpi_accounts),
        creator_share,
        decimals,
    )?;

    // --- Bubblegum mint_v1 CPI (via mpl-bubblegum 3.0.0) ---
    // Self-audit P2-005: discriminator + arg layout now sourced from
    // the published crate, so a Bubblegum upstream change in 3.1.x
    // surfaces as a compile error here instead of a silent runtime
    // failure. Account order is enforced by the crate's MintV1 struct.
    let metadata = build_metadata_args(
        &ctx.accounts.event.name,
        &ctx.accounts.event.symbol,
        &ctx.accounts.event.metadata_uri,
    );
    let ix = MintV1 {
        tree_config: ctx.accounts.tree_config.key(),
        leaf_owner: ctx.accounts.leaf_owner.key(),
        leaf_delegate: ctx.accounts.leaf_delegate.key(),
        merkle_tree: ctx.accounts.merkle_tree.key(),
        payer: ctx.accounts.buyer.key(),
        tree_creator_or_delegate: ctx.accounts.event.key(),
        log_wrapper: ctx.accounts.log_wrapper.key(),
        compression_program: ctx.accounts.compression_program.key(),
        system_program: ctx.accounts.system_program.key(),
    }
    .instruction(MintV1InstructionArgs { metadata });

    let creator_key = ctx.accounts.event.creator;
    let event_id_bytes = ctx.accounts.event.event_id.to_le_bytes();
    let event_bump = ctx.accounts.event.bump;
    let signer_seeds: &[&[u8]] = &[
        EVENT_SEED,
        creator_key.as_ref(),
        event_id_bytes.as_ref(),
        std::slice::from_ref(&event_bump),
    ];

    invoke_signed(
        &ix,
        &[
            ctx.accounts.tree_config.to_account_info(),
            ctx.accounts.leaf_owner.to_account_info(),
            ctx.accounts.leaf_delegate.to_account_info(),
            ctx.accounts.merkle_tree.to_account_info(),
            ctx.accounts.buyer.to_account_info(),
            ctx.accounts.event.to_account_info(),
            ctx.accounts.log_wrapper.to_account_info(),
            ctx.accounts.compression_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // --- Update event state ---
    let event_key = ctx.accounts.event.key();
    let event = &mut ctx.accounts.event;
    event.sold = event.sold.checked_add(1).ok_or(EventTicketsError::ArithmeticOverflow)?;
    event.total_revenue = event
        .total_revenue
        .checked_add(creator_share)
        .ok_or(EventTicketsError::ArithmeticOverflow)?;
    event.updated_at = now;

    emit!(TicketMinted {
        event: event_key,
        buyer: ctx.accounts.buyer.key(),
        merkle_tree: event.merkle_tree,
        sold: event.sold,
        seller_share: creator_share,
        fee,
        timestamp: now,
    });
    Ok(())
}

/// Borsh-serialise a minimal `MetadataArgs` struct matching Bubblegum's IDL v1.
/// Build a Bubblegum `MetadataArgs` for a single primary-sale ticket
/// using the published `mpl-bubblegum` types so the layout tracks
/// upstream via Cargo.
fn build_metadata_args(name: &str, symbol: &str, uri: &str) -> MetadataArgs {
    MetadataArgs {
        name: name.to_string(),
        symbol: symbol.to_string(),
        uri: uri.to_string(),
        seller_fee_basis_points: 0,
        primary_sale_happened: true,
        is_mutable: false,
        edition_nonce: None,
        token_standard: Some(TokenStandard::NonFungible),
        collection: None,
        uses: None,
        token_program_version: TokenProgramVersion::Original,
        creators: vec![],
    }
}
