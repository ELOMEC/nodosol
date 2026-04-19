mod common;

use common::{cancel_ix, charge_ix, PlanFixture, PERIOD_DAY, USDC_UNIT};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn charge(
    fx: &PlanFixture,
    cranker: &solana_pubkey::Pubkey,
    subscriber_ata: &solana_pubkey::Pubkey,
    subscription_pda: &solana_pubkey::Pubkey,
) -> anchor_lang::solana_program::instruction::Instruction {
    charge_ix(
        &fx.ctx.program_id,
        cranker,
        &fx.plan,
        subscription_pda,
        subscriber_ata,
        &fx.vault,
        &fx.config,
        &fx.treasury,
        &fx.mint,
        &fx.ctx.token_program,
    )
}

#[test]
fn charge_rejects_before_period_elapses() {
    let price = 10 * USDC_UNIT;
    let mut fx = PlanFixture::new(price, PERIOD_DAY);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();

    let cranker = Keypair::new();
    fx.ctx.fund(&cranker.pubkey(), 5_000_000_000);

    fx.ctx.advance_time(PERIOD_DAY - 1);

    let res = fx.ctx.send(
        charge(&fx, &cranker.pubkey(), &subscriber_ata, &subscription_pda),
        &cranker,
        &[],
    );
    assert!(res.is_err(), "charge before period must be rejected");
}

#[test]
fn charge_transfers_and_advances_next_charge_at() {
    let price = 10 * USDC_UNIT;
    let mut fx = PlanFixture::new(price, PERIOD_DAY);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();

    let first_next_charge = fx.ctx.get_subscription(&subscription_pda).next_charge_at;

    fx.ctx.advance_time(PERIOD_DAY);

    let cranker = Keypair::new();
    fx.ctx.fund(&cranker.pubkey(), 5_000_000_000);

    fx.ctx
        .send(
            charge(&fx, &cranker.pubkey(), &subscriber_ata, &subscription_pda),
            &cranker,
            &[],
        )
        .unwrap();

    assert_eq!(fx.ctx.token_balance(&subscriber_ata), 100 * USDC_UNIT - 2 * price);
    assert_eq!(fx.ctx.token_balance(&fx.vault), 2 * price);

    let sub = fx.ctx.get_subscription(&subscription_pda);
    assert_eq!(sub.charge_count, 2);
    assert_eq!(sub.total_paid, 2 * price);
    assert_eq!(sub.last_charged_at, fx.ctx.now());
    assert_eq!(sub.next_charge_at, first_next_charge + PERIOD_DAY);

    let plan = fx.ctx.get_plan(&fx.plan);
    assert_eq!(plan.total_collected, 2 * price);
}

#[test]
fn charge_handles_multiple_cycles() {
    let price = 5 * USDC_UNIT;
    let mut fx = PlanFixture::new(price, PERIOD_DAY);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(50 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 50 * USDC_UNIT)
        .unwrap();

    let cranker = Keypair::new();
    fx.ctx.fund(&cranker.pubkey(), 5_000_000_000);

    for _ in 0..4 {
        fx.ctx.advance_time(PERIOD_DAY);
        fx.ctx
            .send(
                charge(&fx, &cranker.pubkey(), &subscriber_ata, &subscription_pda),
                &cranker,
                &[],
            )
            .unwrap();
    }

    let sub = fx.ctx.get_subscription(&subscription_pda);
    assert_eq!(sub.charge_count, 5); // 1 on subscribe + 4 charges
    assert_eq!(sub.total_paid, 5 * price);
    assert_eq!(fx.ctx.token_balance(&fx.vault), 5 * price);
}

#[test]
fn charge_rejects_cancelled_subscription() {
    let price = 10 * USDC_UNIT;
    let mut fx = PlanFixture::new(price, PERIOD_DAY);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();

    let cancel = cancel_ix(
        &fx.ctx.program_id,
        &subscriber.pubkey(),
        &fx.plan,
        &subscription_pda,
    );
    fx.ctx.send(cancel, &subscriber, &[]).unwrap();

    let cranker = Keypair::new();
    fx.ctx.fund(&cranker.pubkey(), 5_000_000_000);

    fx.ctx.advance_time(PERIOD_DAY);

    let res = fx.ctx.send(
        charge(&fx, &cranker.pubkey(), &subscriber_ata, &subscription_pda),
        &cranker,
        &[],
    );
    assert!(res.is_err(), "charge on cancelled subscription must fail");
}

#[test]
fn charge_fails_when_subscriber_has_insufficient_balance() {
    let price = 10 * USDC_UNIT;
    let mut fx = PlanFixture::new(price, PERIOD_DAY);
    // Subscriber funds cover only the first charge.
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(price);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();

    assert_eq!(fx.ctx.token_balance(&subscriber_ata), 0);

    let cranker = Keypair::new();
    fx.ctx.fund(&cranker.pubkey(), 5_000_000_000);

    fx.ctx.advance_time(PERIOD_DAY);

    let res = fx.ctx.send(
        charge(&fx, &cranker.pubkey(), &subscriber_ata, &subscription_pda),
        &cranker,
        &[],
    );
    assert!(res.is_err(), "charge with empty subscriber ATA must fail");
}

#[test]
fn charge_splits_fee_to_treasury_when_fee_bps_set() {
    let price = 10 * USDC_UNIT;
    // 100 bps = 1% on each charge.
    let mut fx = PlanFixture::new_with_fee(price, PERIOD_DAY, 100);
    let (subscriber, subscriber_ata, subscription_pda) = fx.new_subscriber(100 * USDC_UNIT);
    fx.subscribe(&subscriber, &subscriber_ata, &subscription_pda, 100 * USDC_UNIT)
        .unwrap();

    let fee_each = price / 100;
    let creator_each = price - fee_each;
    // First charge happened during subscribe.
    assert_eq!(fx.ctx.token_balance(&fx.treasury), fee_each);
    assert_eq!(fx.ctx.token_balance(&fx.vault), creator_each);

    fx.ctx.advance_time(PERIOD_DAY);
    let cranker = Keypair::new();
    fx.ctx.fund(&cranker.pubkey(), 5_000_000_000);
    fx.ctx
        .send(
            charge(&fx, &cranker.pubkey(), &subscriber_ata, &subscription_pda),
            &cranker,
            &[],
        )
        .unwrap();

    // Second charge doubles treasury + vault contributions.
    assert_eq!(fx.ctx.token_balance(&fx.treasury), 2 * fee_each);
    assert_eq!(fx.ctx.token_balance(&fx.vault), 2 * creator_each);
}
