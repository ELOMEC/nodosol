mod common;

use common::{send_tip_ix, Fixture};
use solana_signer::Signer;

const USDC_UNIT: u64 = 1_000_000; // 1 USDC @ 6 decimals

#[test]
fn send_tip_transfers_usdc_and_updates_stats() {
    let starting = 100 * USDC_UNIT;
    let tip_amount = 5 * USDC_UNIT;

    let mut fx = Fixture::new(starting);

    let ix = send_tip_ix(
        &fx.ctx.program_id,
        &fx.tipper.pubkey(),
        &fx.tipper_ata,
        &fx.creator_profile,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
        tip_amount,
    );

    fx.ctx.send(ix, &fx.tipper, &[]).unwrap();

    assert_eq!(fx.ctx.token_balance(&fx.tipper_ata), starting - tip_amount);
    assert_eq!(fx.ctx.token_balance(&fx.vault), tip_amount);

    let profile = fx.ctx.get_profile(&fx.creator_profile);
    assert_eq!(profile.total_tips_amount, tip_amount);
    assert_eq!(profile.total_tip_count, 1);
}

#[test]
fn send_tip_accumulates_over_multiple_tips() {
    let starting = 100 * USDC_UNIT;
    let first = 3 * USDC_UNIT;
    let second = 7 * USDC_UNIT;

    let mut fx = Fixture::new(starting);

    for amount in [first, second] {
        let ix = send_tip_ix(
            &fx.ctx.program_id,
            &fx.tipper.pubkey(),
            &fx.tipper_ata,
            &fx.creator_profile,
            &fx.vault,
            &fx.mint,
            &fx.ctx.token_program,
            amount,
        );
        fx.ctx.send(ix, &fx.tipper, &[]).unwrap();
    }

    assert_eq!(fx.ctx.token_balance(&fx.vault), first + second);

    let profile = fx.ctx.get_profile(&fx.creator_profile);
    assert_eq!(profile.total_tips_amount, first + second);
    assert_eq!(profile.total_tip_count, 2);
}

#[test]
fn send_tip_rejects_zero_amount() {
    let mut fx = Fixture::new(10 * USDC_UNIT);

    let ix = send_tip_ix(
        &fx.ctx.program_id,
        &fx.tipper.pubkey(),
        &fx.tipper_ata,
        &fx.creator_profile,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
        0,
    );

    let res = fx.ctx.send(ix, &fx.tipper, &[]);
    assert!(res.is_err(), "zero-amount tip must be rejected");
}

#[test]
fn send_tip_fails_when_tipper_has_insufficient_balance() {
    let mut fx = Fixture::new(2 * USDC_UNIT);

    let ix = send_tip_ix(
        &fx.ctx.program_id,
        &fx.tipper.pubkey(),
        &fx.tipper_ata,
        &fx.creator_profile,
        &fx.vault,
        &fx.mint,
        &fx.ctx.token_program,
        10 * USDC_UNIT,
    );

    let res = fx.ctx.send(ix, &fx.tipper, &[]);
    assert!(res.is_err(), "tip larger than tipper balance must fail");
}
