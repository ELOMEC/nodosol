mod common;

use common::{create_event_ix, TestCtx, DAY, USDC_UNIT};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn base_setup() -> (TestCtx, Keypair, solana_pubkey::Pubkey) {
    let mut ctx = TestCtx::new();
    let mint_authority = Keypair::new();
    ctx.fund(&mint_authority.pubkey(), 5_000_000_000);
    let mint = ctx.create_usdc_mint(&mint_authority);
    (ctx, mint_authority, mint)
}

#[test]
fn create_event_success() {
    let (mut ctx, _ma, mint) = base_setup();

    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let event_id = 1u64;
    let price = 10 * USDC_UNIT;
    let capacity = 200u64;
    let starts_at = ctx.now() + DAY;
    let ends_at = starts_at + DAY * 2;
    let uri = "ipfs://bafy-demo".to_string();

    let (event, expected_bump) = ctx.event_pda(&creator.pubkey(), event_id);
    let (vault, expected_vault_bump) = ctx.vault_pda(&event);

    let ix = create_event_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &event,
        &vault,
        &ctx.token_program,
        event_id,
        price,
        capacity,
        starts_at,
        ends_at,
        uri.clone(),
    );
    ctx.send(ix, &creator, &[]).unwrap();

    let e = ctx.get_event(&event);
    assert_eq!(e.creator, creator.pubkey());
    assert_eq!(e.mint, mint);
    assert_eq!(e.vault, vault);
    assert_eq!(e.event_id, event_id);
    assert_eq!(e.price, price);
    assert_eq!(e.capacity, capacity);
    assert_eq!(e.sold_count, 0);
    assert_eq!(e.checked_in_count, 0);
    assert_eq!(e.starts_at, starts_at);
    assert_eq!(e.ends_at, ends_at);
    assert!(e.active);
    assert_eq!(e.metadata_uri, uri);
    assert_eq!(e.total_revenue, 0);
    assert_eq!(e.total_withdrawn, 0);
    assert_eq!(e.created_at, ctx.now());
    assert_eq!(e.bump, expected_bump);
    assert_eq!(e.vault_bump, expected_vault_bump);
    assert_eq!(e.reserved, [0u8; 64]);
    assert_eq!(ctx.token_balance(&vault), 0);
}

#[test]
fn create_event_rejects_invalid_dates() {
    let (mut ctx, _ma, mint) = base_setup();

    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let event_id = 1u64;
    let (event, _) = ctx.event_pda(&creator.pubkey(), event_id);
    let (vault, _) = ctx.vault_pda(&event);

    let ix = create_event_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &event,
        &vault,
        &ctx.token_program,
        event_id,
        USDC_UNIT,
        0,
        ctx.now() + DAY,
        ctx.now() + DAY, // ends == starts
        "ipfs://x".to_string(),
    );
    let res = ctx.send(ix, &creator, &[]);
    assert!(res.is_err(), "ends_at == starts_at must be rejected");
}

#[test]
fn create_event_rejects_empty_uri() {
    let (mut ctx, _ma, mint) = base_setup();

    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let event_id = 1u64;
    let (event, _) = ctx.event_pda(&creator.pubkey(), event_id);
    let (vault, _) = ctx.vault_pda(&event);

    let ix = create_event_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &event,
        &vault,
        &ctx.token_program,
        event_id,
        USDC_UNIT,
        0,
        ctx.now() + DAY,
        ctx.now() + DAY * 2,
        "".to_string(),
    );
    let res = ctx.send(ix, &creator, &[]);
    assert!(res.is_err(), "empty metadata_uri must be rejected");
}

#[test]
fn create_event_rejects_oversized_uri() {
    let (mut ctx, _ma, mint) = base_setup();

    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let event_id = 1u64;
    let (event, _) = ctx.event_pda(&creator.pubkey(), event_id);
    let (vault, _) = ctx.vault_pda(&event);

    let long_uri = "x".repeat(201);
    let ix = create_event_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &event,
        &vault,
        &ctx.token_program,
        event_id,
        USDC_UNIT,
        0,
        ctx.now() + DAY,
        ctx.now() + DAY * 2,
        long_uri,
    );
    let res = ctx.send(ix, &creator, &[]);
    assert!(res.is_err(), "oversized metadata_uri must be rejected");
}

#[test]
fn create_event_allows_free_events() {
    let (mut ctx, _ma, mint) = base_setup();

    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let event_id = 1u64;
    let (event, _) = ctx.event_pda(&creator.pubkey(), event_id);
    let (vault, _) = ctx.vault_pda(&event);

    let ix = create_event_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &event,
        &vault,
        &ctx.token_program,
        event_id,
        0, // free
        100,
        ctx.now(),
        ctx.now() + DAY * 2,
        "ipfs://free".to_string(),
    );
    ctx.send(ix, &creator, &[]).unwrap();
    assert_eq!(ctx.get_event(&event).price, 0);
}
