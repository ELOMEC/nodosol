use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};

use crate::{
    constants::{
        ACCOUNT_COMPRESSION_PROGRAM_ID, BUBBLEGUM_PROGRAM_ID, EVENT_SEED, NOOP_PROGRAM_ID,
        RESALE_SEED,
    },
    error::EventTicketsError,
    events::TicketResaleListed,
    state::{Event, TicketResaleListing},
};

// sha256("global:transfer")[..8] — Metaplex Bubblegum transfer discriminator.
pub(crate) const BUBBLEGUM_TRANSFER_DISCRIMINATOR: [u8; 8] =
    [163, 52, 200, 231, 140, 3, 69, 186];

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

    // Build Bubblegum `transfer` instruction data.
    let mut data = Vec::with_capacity(8 + 32 * 3 + 8 + 4);
    data.extend_from_slice(&BUBBLEGUM_TRANSFER_DISCRIMINATOR);
    data.extend_from_slice(&root);
    data.extend_from_slice(&data_hash);
    data.extend_from_slice(&creator_hash);
    data.extend_from_slice(&nonce.to_le_bytes());
    data.extend_from_slice(&leaf_index.to_le_bytes());

    // Account order per mpl-bubblegum v1.x transfer ix:
    // 0 tree_authority (tree_config, mut)
    // 1 leaf_owner (signer)                 — seller for list
    // 2 leaf_delegate (signer)              — seller for list (same as owner)
    // 3 new_leaf_owner (readonly)           — listing PDA for list
    // 4 merkle_tree (mut)
    // 5 log_wrapper
    // 6 compression_program
    // 7 system_program
    // 8..  proof siblings (remaining_accounts)
    let mut accounts = vec![
        AccountMeta::new(tree_config_key, false),
        AccountMeta::new_readonly(seller_key, true), // leaf_owner = seller, signer
        AccountMeta::new_readonly(seller_key, true), // leaf_delegate = seller, signer
        AccountMeta::new_readonly(listing_key, false), // new_leaf_owner = listing PDA
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
