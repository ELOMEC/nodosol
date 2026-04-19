mod common;

use common::{send_tip_ix, update_fee_bps_ix, Fixture};
use solana_signer::Signer;

const USDC_UNIT: u64 = 1_000_000; // 1 USDC @ 6 decimals

fn tip_ix(fx: &Fixture, amount: u64) -> anchor_lang::solana_program::instruction::Instruction {
    send_tip_ix(
        &fx.ctx.program_id,
        &fx.tipper.pubkey(),
        &fx.tipper_ata,
        &fx.creator_profile,
        &fx.vault,
        &fx.config,
        &fx.treasury,
        &fx.mint,
        &fx.ctx.token_program,
        amount,
    )
}

#[test]
fn send_tip_transfers_usdc_and_updates_stats() {
    let starting = 100 * USDC_UNIT;
    let tip_amount = 5 * USDC_UNIT;

    let mut fx = Fixture::new(starting);

    fx.ctx.send(tip_ix(&fx, tip_amount), &fx.tipper, &[]).unwrap();

    assert_eq!(fx.ctx.token_balance(&fx.tipper_ata), starting - tip_amount);
    assert_eq!(fx.ctx.token_balance(&fx.vault), tip_amount);
    assert_eq!(fx.ctx.token_balance(&fx.treasury), 0);

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
        fx.ctx.send(tip_ix(&fx, amount), &fx.tipper, &[]).unwrap();
    }

    assert_eq!(fx.ctx.token_balance(&fx.vault), first + second);

    let profile = fx.ctx.get_profile(&fx.creator_profile);
    assert_eq!(profile.total_tips_amount, first + second);
    assert_eq!(profile.total_tip_count, 2);
}

#[test]
fn send_tip_rejects_zero_amount() {
    let mut fx = Fixture::new(10 * USDC_UNIT);
    let res = fx.ctx.send(tip_ix(&fx, 0), &fx.tipper, &[]);
    assert!(res.is_err(), "zero-amount tip must be rejected");
}

#[test]
fn send_tip_fails_when_tipper_has_insufficient_balance() {
    let mut fx = Fixture::new(2 * USDC_UNIT);
    let res = fx.ctx.send(tip_ix(&fx, 10 * USDC_UNIT), &fx.tipper, &[]);
    assert!(res.is_err(), "tip larger than tipper balance must fail");
}

#[test]
fn send_tip_splits_fee_to_treasury_when_fee_bps_set() {
    let starting = 100 * USDC_UNIT;
    let tip_amount = 10 * USDC_UNIT;
    // 100 bps = 1% → fee = 0.1 USDC
    let mut fx = Fixture::new_with_fee(starting, 100);

    fx.ctx.send(tip_ix(&fx, tip_amount), &fx.tipper, &[]).unwrap();

    let fee = tip_amount / 100; // 1%
    let creator_amount = tip_amount - fee;
    assert_eq!(fx.ctx.token_balance(&fx.tipper_ata), starting - tip_amount);
    assert_eq!(fx.ctx.token_balance(&fx.vault), creator_amount);
    assert_eq!(fx.ctx.token_balance(&fx.treasury), fee);

    let profile = fx.ctx.get_profile(&fx.creator_profile);
    // Stats track the creator share, not the gross tip.
    assert_eq!(profile.total_tips_amount, creator_amount);
}

#[test]
fn send_tip_picks_up_updated_fee_bps() {
    let mut fx = Fixture::new(200 * USDC_UNIT);

    // First tip at 0 bps → vault gets the full amount.
    fx.ctx.send(tip_ix(&fx, 10 * USDC_UNIT), &fx.tipper, &[]).unwrap();
    assert_eq!(fx.ctx.token_balance(&fx.treasury), 0);

    // Bump fee to 500 bps = 5%.
    let authority = fx.config_authority.insecure_clone();
    let update_ix = update_fee_bps_ix(&fx.ctx.program_id, &authority.pubkey(), &fx.config, 500);
    fx.ctx.send(update_ix, &authority, &[]).unwrap();

    // Second tip at 500 bps → treasury catches 5%, vault catches the rest.
    fx.ctx.send(tip_ix(&fx, 20 * USDC_UNIT), &fx.tipper, &[]).unwrap();
    let fee2 = 20 * USDC_UNIT * 500 / 10_000;
    assert_eq!(fx.ctx.token_balance(&fx.treasury), fee2);
    assert_eq!(fx.ctx.token_balance(&fx.vault), 10 * USDC_UNIT + (20 * USDC_UNIT - fee2));
}
