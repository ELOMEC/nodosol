use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::AccountMeta, program::invoke};
use mpl_bubblegum::instructions::{Transfer, TransferInstructionArgs};

use crate::{
    constants::{
        ACCOUNT_COMPRESSION_PROGRAM_ID, BUBBLEGUM_PROGRAM_ID, EVENT_SEED, NOOP_PROGRAM_ID,
        RESALE_SEED,
    },
    error::EventTicketsError,
    events::TicketResaleListed,
    state::{Event, TicketResaleListing},
};

/// Private-price variant of list_ticket_resale.
///
/// Instead of a plain `price: u64`, the seller commits to
/// `price_commit = keccak256(price_le_bytes || 32-byte nonce)` — the
/// actual price stays off-chain until a buyer reveals it via
/// `buy_ticket_resale_private`. The hash function MUST match the
/// reveal verifier in `buy_ticket_resale_private.rs`; clients
/// generating commits off-chain must use keccak256, not sha256. Useful for corporate deals, invite-only
/// drops, and as the primitive that later sealed-bid auctions will
/// reuse.
///
/// Everything else mirrors the public variant — same custody pattern
/// (cNFT transferred into the listing PDA in the same tx) and the
/// same PDA seeds so a cNFT can still only have one active listing
/// at a time, whether public or private.
#[derive(Accounts)]
#[instruction(
    leaf_index: u32,
)]
pub struct ListTicketResalePrivate<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        seeds = [EVENT_SEED, event.creator.as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
    )]
    pub event: Box<Account<'info, Event>>,

    #[account(
        init,
        payer = seller,
        space = 8 + TicketResaleListing::INIT_SPACE,
        seeds = [RESALE_SEED, merkle_tree.key().as_ref(), &leaf_index.to_le_bytes()],
        bump,
    )]
    pub listing: Box<Account<'info, TicketResaleListing>>,

    /// CHECK: Bubblegum derives and validates.
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: must equal event.merkle_tree.
    #[account(
        mut,
        address = event.merkle_tree @ EventTicketsError::ResaleTreeMismatch,
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

#[allow(clippy::too_many_arguments)]
pub fn handle_list_ticket_resale_private<'info>(
    ctx: Context<'info, ListTicketResalePrivate<'info>>,
    leaf_index: u32,
    nonce: u64,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    price_commit: [u8; 32],
    expires_at: i64,
) -> Result<()> {
    // price_commit must be non-zero — otherwise we couldn't tell a private
    // listing apart from a public one via `is_private()`.
    require!(price_commit != [0u8; 32], EventTicketsError::PriceCommitMismatch);
    let now = Clock::get()?.unix_timestamp;
    if expires_at > 0 {
        require!(expires_at > now, EventTicketsError::InvalidTimeWindow);
    }

    let listing_key = ctx.accounts.listing.key();
    let seller_key = ctx.accounts.seller.key();
    let tree_config_key = ctx.accounts.tree_config.key();
    let merkle_tree_key = ctx.accounts.merkle_tree.key();

    // Bubblegum `transfer` CPI via mpl-bubblegum 3.0.0 (P2-005).
    // Same shape as the public list — move cNFT into the listing PDA.
    let proof_metas: Vec<AccountMeta> = ctx
        .remaining_accounts
        .iter()
        .map(|acc| AccountMeta::new_readonly(acc.key(), false))
        .collect();
    let ix = Transfer {
        tree_config: tree_config_key,
        leaf_owner: (seller_key, true),
        leaf_delegate: (seller_key, true),
        new_leaf_owner: listing_key,
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
        ctx.accounts.seller.to_account_info(),
        ctx.accounts.seller.to_account_info(),
        ctx.accounts.listing.to_account_info(),
        ctx.accounts.merkle_tree.to_account_info(),
        ctx.accounts.log_wrapper.to_account_info(),
        ctx.accounts.compression_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
    ];
    for acc in ctx.remaining_accounts.iter() {
        infos.push(acc.clone());
    }

    invoke(&ix, &infos)?;

    let listing = &mut ctx.accounts.listing;
    listing.seller = seller_key;
    listing.event = ctx.accounts.event.key();
    listing.merkle_tree = merkle_tree_key;
    listing.payment_mint = ctx.accounts.event.payment_mint;
    listing.leaf_index = leaf_index;
    listing.nonce = nonce;
    listing.price = 0; // hidden in price_commit
    listing.price_commit = price_commit;
    listing.created_at = now;
    listing.expires_at = expires_at;
    listing.bump = ctx.bumps.listing;
    listing.reserved = [0u8; 16];

    emit!(TicketResaleListed {
        listing: listing_key,
        seller: seller_key,
        merkle_tree: merkle_tree_key,
        leaf_index,
        price: 0, // deliberately not revealing via event
        expires_at,
        timestamp: now,
    });
    Ok(())
}
