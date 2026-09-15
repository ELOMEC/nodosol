mod common;

use common::{create_plan_ix, PERIOD_DAY, PERIOD_HOUR, TestCtx, USDC_UNIT};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn setup() -> (TestCtx, Keypair, solana_pubkey::Pubkey) {
    let mut ctx = TestCtx::new();
    let mint_authority = Keypair::new();
    ctx.fund(&mint_authority.pubkey(), 5_000_000_000);
    let mint = ctx.create_usdc_mint(&mint_authority);
    (ctx, mint_authority, mint)
}

#[test]
fn create_plan_success() {
    let (mut ctx, _ma, mint) = setup();

    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let plan_id = 42u64;
    let price = 10 * USDC_UNIT;
    let period = PERIOD_DAY * 30;

    let (plan, expected_bump) = ctx.plan_pda(&creator.pubkey(), plan_id);
    let (vault, expected_vault_bump) = ctx.vault_pda(&plan);

    let ix = create_plan_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &plan,
        &vault,
        &ctx.token_program,
        plan_id,
        price,
        period,
    );
    ctx.send(ix, &creator, &[]).unwrap();

    let p = ctx.get_plan(&plan);
    assert_eq!(p.creator, creator.pubkey());
    assert_eq!(p.mint, mint);
    assert_eq!(p.vault, vault);
    assert_eq!(p.plan_id, plan_id);
    assert_eq!(p.price_per_period, price);
    assert_eq!(p.period_seconds, period);
    assert!(p.active);
    assert_eq!(p.subscriber_count, 0);
    assert_eq!(p.total_collected, 0);
    assert_eq!(p.bump, expected_bump);
    assert_eq!(p.vault_bump, expected_vault_bump);
    assert_eq!(p.created_at, ctx.now());
    assert_eq!(p.reserved, [0u8; 64]);
    assert_eq!(ctx.token_balance(&vault), 0);
}

#[test]
fn create_plan_rejects_zero_price() {
    let (mut ctx, _ma, mint) = setup();
    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let plan_id = 1u64;
    let (plan, _) = ctx.plan_pda(&creator.pubkey(), plan_id);
    let (vault, _) = ctx.vault_pda(&plan);

    let ix = create_plan_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &plan,
        &vault,
        &ctx.token_program,
        plan_id,
        0,
        PERIOD_DAY,
    );
    let res = ctx.send(ix, &creator, &[]);
    assert!(res.is_err(), "zero price must be rejected");
}

#[test]
fn create_plan_rejects_period_below_minimum() {
    let (mut ctx, _ma, mint) = setup();
    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let plan_id = 1u64;
    let (plan, _) = ctx.plan_pda(&creator.pubkey(), plan_id);
    let (vault, _) = ctx.vault_pda(&plan);

    let ix = create_plan_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &plan,
        &vault,
        &ctx.token_program,
        plan_id,
        USDC_UNIT,
        PERIOD_HOUR - 1,
    );
    let res = ctx.send(ix, &creator, &[]);
    assert!(res.is_err(), "sub-hour period must be rejected");
}

#[test]
fn create_plan_rejects_period_above_maximum() {
    let (mut ctx, _ma, mint) = setup();
    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    let plan_id = 1u64;
    let (plan, _) = ctx.plan_pda(&creator.pubkey(), plan_id);
    let (vault, _) = ctx.vault_pda(&plan);

    let ix = create_plan_ix(
        &ctx.program_id,
        &creator.pubkey(),
        &mint,
        &plan,
        &vault,
        &ctx.token_program,
        plan_id,
        USDC_UNIT,
        63_072_001,
    );
    let res = ctx.send(ix, &creator, &[]);
    assert!(res.is_err(), "period > 2y must be rejected");
}

#[test]
fn create_plan_allows_multiple_plans_per_creator() {
    let (mut ctx, _ma, mint) = setup();
    let creator = Keypair::new();
    ctx.fund(&creator.pubkey(), 5_000_000_000);

    for (plan_id, price) in [(1u64, 5 * USDC_UNIT), (2u64, 15 * USDC_UNIT)] {
        let (plan, _) = ctx.plan_pda(&creator.pubkey(), plan_id);
        let (vault, _) = ctx.vault_pda(&plan);
        let ix = create_plan_ix(
            &ctx.program_id,
            &creator.pubkey(),
            &mint,
            &plan,
            &vault,
            &ctx.token_program,
            plan_id,
            price,
            PERIOD_DAY,
        );
        ctx.send(ix, &creator, &[]).unwrap();
        assert_eq!(ctx.get_plan(&plan).price_per_period, price);
    }
}
