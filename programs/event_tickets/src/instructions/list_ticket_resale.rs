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

#[derive(Accounts)]
#[instruction(
    leaf_index: u32,
)]
pub struct ListTicketResale<'info> {
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

    // Bubblegum transfer accounts ---------------------------------------
    /// CHECK: Bubblegum derives and validates.
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: validated by Bubblegum — must equal `event.merkle_tree`.
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
pub fn handle_list_ticket_resale<'info>(
    ctx: Context<'info, ListTicketResale<'info>>,
    leaf_index: u32,
    nonce: u64,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    price: u64,
    expires_at: i64,
) -> Result<()> {
    require!(price > 0, EventTicketsError::InvalidPrice);
    let now = Clock::get()?.unix_timestamp;
    if expires_at > 0 {
        require!(expires_at > now, EventTicketsError::InvalidTimeWindow);
    }

    let listing_key = ctx.accounts.listing.key();
    let seller_key = ctx.accounts.seller.key();
    let tree_config_key = ctx.accounts.tree_config.key();
    let merkle_tree_key = ctx.accounts.merkle_tree.key();

    // Bubblegum `transfer` CPI via mpl-bubblegum 3.0.0 (P2-005).
    // Seller signs as both leaf_owner and leaf_delegate (no prior delegate).
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
        ctx.accounts.seller.to_account_info(), // leaf_owner
        ctx.accounts.seller.to_account_info(), // leaf_delegate
        ctx.accounts.listing.to_account_info(), // new_leaf_owner
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
    listing.price = price;
    listing.price_commit = [0u8; 32]; // public listing — commit unused
    listing.created_at = now;
    listing.expires_at = expires_at;
    listing.bump = ctx.bumps.listing;
    listing.reserved = [0u8; 16];

    emit!(TicketResaleListed {
        listing: listing_key,
        seller: seller_key,
        merkle_tree: merkle_tree_key,
        leaf_index,
        price,
        expires_at,
        timestamp: now,
    });
    Ok(())
}
