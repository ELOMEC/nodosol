mod common;

use common::{initialize_creator_ix, TestCtx};
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn initialize_creator_success() {
    let mut ctx = TestCtx::new();

    let mint_authority = Keypair::new();
    ctx.fund(&mint_authority.pubkey(), 5_000_000_000);
    let mint = ctx.create_usdc_mint(&mint_authority);

    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let (creator_profile, expected_bump) = ctx.creator_profile_pda(&creator.pubkey());
    let (vault, expected_vault_bump) = ctx.vault_pda(&creator_profile);

    let ix = initialize_creator_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &creator_profile,
        &vault,
        &ctx.token_program,
    );

    ctx.send(ix, &creator, &[]).unwrap();

    let profile = ctx.get_profile(&creator_profile);
    assert_eq!(profile.owner, creator.pubkey());
    assert_eq!(profile.mint, mint);
    assert_eq!(profile.vault, vault);
    assert_eq!(profile.elgamal_pubkey, [0u8; 32]);
    assert_eq!(profile.total_tips_amount, 0);
    assert_eq!(profile.total_tip_count, 0);
    assert_eq!(profile.total_withdrawn_amount, 0);
    assert_eq!(profile.bump, expected_bump);
    assert_eq!(profile.vault_bump, expected_vault_bump);
    assert!(profile.created_at > 0);
    assert_eq!(profile.reserved, [0u8; 64]);

    assert_eq!(ctx.token_balance(&vault), 0);
}

#[test]
fn initialize_creator_is_idempotent_blocking() {
    let mut ctx = TestCtx::new();

    let mint_authority = Keypair::new();
    ctx.fund(&mint_authority.pubkey(), 5_000_000_000);
    let mint = ctx.create_usdc_mint(&mint_authority);

    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);
    let (creator_profile, _) = ctx.creator_profile_pda(&creator.pubkey());
    let (vault, _) = ctx.vault_pda(&creator_profile);

    let ix = initialize_creator_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &creator_profile,
        &vault,
        &ctx.token_program,
    );
    ctx.send(ix.clone(), &creator, &[]).unwrap();

    let second = ctx.send(ix, &creator, &[]);
    assert!(
        second.is_err(),
        "second initialize_creator must fail — profile already exists"
    );
}
