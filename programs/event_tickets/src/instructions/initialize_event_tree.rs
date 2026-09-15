use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

use crate::{
    constants::{
        ACCOUNT_COMPRESSION_PROGRAM_ID, BUBBLEGUM_CREATE_TREE_DISCRIMINATOR,
        BUBBLEGUM_PROGRAM_ID, EVENT_SEED, NOOP_PROGRAM_ID, TREE_CANOPY_DEPTH,
        TREE_MAX_BUFFER_SIZE, TREE_MAX_DEPTH,
    },
    error::EventTicketsError,
    events::EventTreeInitialised,
    state::Event,
};

#[derive(Accounts)]
pub struct InitializeEventTree<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [EVENT_SEED, event.creator.as_ref(), &event.event_id.to_le_bytes()],
        bump = event.bump,
        has_one = creator @ EventTicketsError::NotCreator,
    )]
    pub event: Box<Account<'info, Event>>,

    /// Bubblegum tree config PDA — derived as [merkle_tree] within Bubblegum.
    /// CHECK: Bubblegum validates.
    #[account(mut)]
    pub tree_config: UncheckedAccount<'info>,

    /// Merkle tree account — the caller allocates it in the same
    /// transaction with SystemProgram.createAccount using the size returned
    /// by spl-account-compression for (max_depth=14, max_buffer_size=64).
    /// CHECK: Bubblegum + Account Compression validate.
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,

    /// CHECK: pinned Bubblegum program address.
    #[account(address = BUBBLEGUM_PROGRAM_ID @ EventTicketsError::InvalidBubblegumProgram)]
    pub bubblegum_program: UncheckedAccount<'info>,

    /// CHECK: pinned SPL Account Compression program address.
    #[account(address = ACCOUNT_COMPRESSION_PROGRAM_ID @ EventTicketsError::InvalidCompressionProgram)]
    pub compression_program: UncheckedAccount<'info>,

    /// CHECK: pinned SPL Noop program address.
    #[account(address = NOOP_PROGRAM_ID @ EventTicketsError::InvalidNoopProgram)]
    pub log_wrapper: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_event_tree(ctx: Context<InitializeEventTree>) -> Result<()> {
    let event = &mut ctx.accounts.event;
    require!(
        !event.tree_initialised,
        EventTicketsError::TreeAlreadyInitialised
    );

    // Build the Bubblegum CreateTreeConfig instruction manually so we don't
    // pull in the mpl-bubblegum crate (Anchor 1.0 / Solana 3.x toolchain
    // compatibility). The on-chain program sees the same serialisation.
    //
    // CreateTreeConfig accounts order (Bubblegum IDL v1):
    //   0: [writable] tree_config            — PDA of [merkle_tree]
    //   1: [writable] merkle_tree
    //   2: [writable, signer] payer
    //   3: [signer]   tree_creator           — we pass the event PDA as the
    //                                         tree delegate, signed via seeds
    //   4: []         log_wrapper            — SPL Noop program
    //   5: []         compression_program    — SPL Account Compression
    //   6: []         system_program
    //
    // Data: [discriminator(8)] [max_depth u32] [max_buffer_size u32]
    //       [public Option<bool> = None (1 byte = 0)]
    // Discriminator centralised in constants.rs (self-audit F-003).
    let mut data = Vec::with_capacity(8 + 4 + 4 + 1);
    data.extend_from_slice(&BUBBLEGUM_CREATE_TREE_DISCRIMINATOR);
    data.extend_from_slice(&TREE_MAX_DEPTH.to_le_bytes());
    data.extend_from_slice(&TREE_MAX_BUFFER_SIZE.to_le_bytes());
    data.push(0); // Option<bool>::None

    let accounts = vec![
        AccountMeta::new(ctx.accounts.tree_config.key(), false),
        AccountMeta::new(ctx.accounts.merkle_tree.key(), false),
        AccountMeta::new(ctx.accounts.creator.key(), true),
        AccountMeta::new_readonly(event.key(), true),
        AccountMeta::new_readonly(ctx.accounts.log_wrapper.key(), false),
        AccountMeta::new_readonly(ctx.accounts.compression_program.key(), false),
        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
    ];

    let ix = Instruction {
        program_id: BUBBLEGUM_PROGRAM_ID,
        accounts,
        data,
    };

    let creator_key = event.creator;
    let event_id_bytes = event.event_id.to_le_bytes();
    let event_bump = event.bump;
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
            ctx.accounts.merkle_tree.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            event.to_account_info(),
            ctx.accounts.log_wrapper.to_account_info(),
            ctx.accounts.compression_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // Suppress unused constant warning when canopy depth is 0. Kept for clarity
    // and future tuning.
    let _ = TREE_CANOPY_DEPTH;

    event.merkle_tree = ctx.accounts.merkle_tree.key();
    event.tree_initialised = true;
    event.updated_at = Clock::get()?.unix_timestamp;

    emit!(EventTreeInitialised {
        event: event.key(),
        merkle_tree: event.merkle_tree,
        timestamp: event.updated_at,
    });
    Ok(())
}
