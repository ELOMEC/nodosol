mod common;

use common::{send_tip_ix, withdraw_ix, Fixture};
use solana_keypair::Keypair;
use solana_signer::Signer;

const USDC_UNIT: u64 = 1_000_000;

fn tip(fx: &mut Fixture, amount: u64) {
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

#[test]
fn withdraw_transfers_usdc_to_creator_ata() {
    let mut fx = Fixture::new(100 * USDC_UNIT);
    tip(&mut fx, 25 * USDC_UNIT);

    let creator_ata = fx.ctx.create_ata(&fx.creator, &fx.creator.pubkey(), &fx.mint);

    let withdraw_amount = 10 * USDC_UNIT;
    let ix = withdraw_ix(
        &fx.ctx.program_id,
        &fx.creator.pubkey(),
        &fx.creator_profile,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        withdraw_amount,
    );
    fx.ctx.send(ix, &fx.creator, &[]).unwrap();

    assert_eq!(fx.ctx.token_balance(&creator_ata), withdraw_amount);
    assert_eq!(fx.ctx.token_balance(&fx.vault), 25 * USDC_UNIT - withdraw_amount);

    let profile = fx.ctx.get_profile(&fx.creator_profile);
    assert_eq!(profile.total_withdrawn_amount, withdraw_amount);
    assert_eq!(profile.total_tips_amount, 25 * USDC_UNIT);
}

#[test]
fn withdraw_rejects_non_owner() {
    let mut fx = Fixture::new(100 * USDC_UNIT);
    tip(&mut fx, 20 * USDC_UNIT);

    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);
    let attacker_ata = fx.ctx.create_ata(&attacker, &attacker.pubkey(), &fx.mint);

    let ix = withdraw_ix(
        &fx.ctx.program_id,
        &attacker.pubkey(),
        &fx.creator_profile,
        &fx.vault,
        &attacker_ata,
        &fx.mint,
        &fx.ctx.token_program,
        5 * USDC_UNIT,
    );

    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "attacker must not be able to withdraw from creator vault");
}

#[test]
fn withdraw_rejects_zero_amount() {
    let mut fx = Fixture::new(100 * USDC_UNIT);
    tip(&mut fx, 20 * USDC_UNIT);

    let creator_ata = fx.ctx.create_ata(&fx.creator, &fx.creator.pubkey(), &fx.mint);

    let ix = withdraw_ix(
        &fx.ctx.program_id,
        &fx.creator.pubkey(),
        &fx.creator_profile,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        0,
    );

    let res = fx.ctx.send(ix, &fx.creator, &[]);
    assert!(res.is_err(), "zero-amount withdraw must be rejected");
}

#[test]
fn withdraw_rejects_amount_greater_than_vault_balance() {
    let mut fx = Fixture::new(100 * USDC_UNIT);
    tip(&mut fx, 5 * USDC_UNIT);

    let creator_ata = fx.ctx.create_ata(&fx.creator, &fx.creator.pubkey(), &fx.mint);

    let ix = withdraw_ix(
        &fx.ctx.program_id,
        &fx.creator.pubkey(),
        &fx.creator_profile,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        100 * USDC_UNIT,
    );

    let res = fx.ctx.send(ix, &fx.creator, &[]);
    assert!(res.is_err(), "overdraw must be rejected");
}
