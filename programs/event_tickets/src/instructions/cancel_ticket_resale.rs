use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

use crate::{
    constants::{
        ACCOUNT_COMPRESSION_PROGRAM_ID, BUBBLEGUM_PROGRAM_ID, NOOP_PROGRAM_ID, RESALE_SEED,
    },
    error::EventTicketsError,
    events::TicketResaleCancelled,
    instructions::list_ticket_resale::BUBBLEGUM_TRANSFER_DISCRIMINATOR,
    state::TicketResaleListing,
};

#[derive(Accounts)]
pub struct CancelTicketResale<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        close = seller,
        seeds = [RESALE_SEED, listing.merkle_tree.as_ref(), &listing.leaf_index.to_le_bytes()],
        bump = listing.bump,
        has_one = seller @ EventTicketsError::NotSeller,
    )]
    pub listing: Box<Account<'info, TicketResaleListing>>,

    // Bubblegum transfer accounts ---------------------------------------
    /// CHECK: Bubblegum derives and validates.
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: validated against listing.merkle_tree below.
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

pub fn handle_cancel_ticket_resale<'info>(
    ctx: Context<'info, CancelTicketResale<'info>>,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let seller_key = ctx.accounts.seller.key();
    let listing_key = ctx.accounts.listing.key();
    let merkle_tree_key = ctx.accounts.merkle_tree.key();
    let nonce = ctx.accounts.listing.nonce;
    let leaf_index = ctx.accounts.listing.leaf_index;
    let bump = ctx.accounts.listing.bump;
    let leaf_index_bytes = leaf_index.to_le_bytes();

    // Build Bubblegum `transfer` instruction data.
    let mut data = Vec::with_capacity(8 + 32 * 3 + 8 + 4);
    data.extend_from_slice(&BUBBLEGUM_TRANSFER_DISCRIMINATOR);
    data.extend_from_slice(&root);
    data.extend_from_slice(&data_hash);
    data.extend_from_slice(&creator_hash);
    data.extend_from_slice(&nonce.to_le_bytes());
    data.extend_from_slice(&leaf_index.to_le_bytes());

    // Listing PDA is both leaf_owner AND leaf_delegate during custody.
    // It signs the CPI via invoke_signed with seeds.
    let mut accounts = vec![
        AccountMeta::new(ctx.accounts.tree_config.key(), false),
        AccountMeta::new_readonly(listing_key, true), // leaf_owner = PDA, signer
        AccountMeta::new_readonly(listing_key, true), // leaf_delegate = PDA, signer
        AccountMeta::new_readonly(seller_key, false), // new_leaf_owner = seller
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
        ctx.accounts.seller.to_account_info(), // new_leaf_owner
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

    emit!(TicketResaleCancelled {
        listing: listing_key,
        seller: seller_key,
        timestamp: now,
    });
    // `close = seller` on the account attribute handles rent refund.
    Ok(())
}
