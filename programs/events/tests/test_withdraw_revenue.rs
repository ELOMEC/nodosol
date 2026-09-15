mod common;

use common::{withdraw_revenue_ix, EventFixture, USDC_UNIT};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn setup_with_revenue() -> (EventFixture, u64) {
    let price = 5 * USDC_UNIT;
    let mut fx = EventFixture::new(price, 10);

    for _ in 0..3 {
        let (a, a_ata, ticket) = fx.new_attendee(100 * USDC_UNIT);
        fx.buy(&a, &a_ata, &ticket).unwrap();
    }

    (fx, 3 * price)
}

#[test]
fn withdraw_revenue_transfers_to_destination() {
    let (mut fx, revenue) = setup_with_revenue();
    let creator = fx.creator.insecure_clone();
    let creator_ata = fx.ctx.create_ata(&creator, &creator.pubkey(), &fx.mint);

    let amount = revenue / 2;
    let ix = withdraw_revenue_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.event,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        amount,
    );
    fx.ctx.send(ix, &creator, &[]).unwrap();

    assert_eq!(fx.ctx.token_balance(&creator_ata), amount);
    assert_eq!(fx.ctx.token_balance(&fx.vault), revenue - amount);

    let event = fx.ctx.get_event(&fx.event);
    assert_eq!(event.total_withdrawn, amount);
    assert_eq!(event.total_revenue, revenue);
}

#[test]
fn withdraw_revenue_rejects_non_creator() {
    let (mut fx, _revenue) = setup_with_revenue();

    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);
    let attacker_ata = fx.ctx.create_ata(&attacker, &attacker.pubkey(), &fx.mint);

    let ix = withdraw_revenue_ix(
        &fx.ctx.program_id,
        &attacker.pubkey(),
        &fx.event,
        &fx.vault,
        &attacker_ata,
        &fx.mint,
        &fx.ctx.token_program,
        USDC_UNIT,
    );
    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "attacker withdraw must fail");
}

#[test]
fn withdraw_revenue_rejects_overdraw() {
    let (mut fx, revenue) = setup_with_revenue();
    let creator = fx.creator.insecure_clone();
    let creator_ata = fx.ctx.create_ata(&creator, &creator.pubkey(), &fx.mint);

    let ix = withdraw_revenue_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.event,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        revenue + 1,
    );
    let res = fx.ctx.send(ix, &creator, &[]);
    assert!(res.is_err(), "overdraw must fail");
}

#[test]
fn withdraw_revenue_rejects_zero_amount() {
    let (mut fx, _revenue) = setup_with_revenue();
    let creator = fx.creator.insecure_clone();
    let creator_ata = fx.ctx.create_ata(&creator, &creator.pubkey(), &fx.mint);

    let ix = withdraw_revenue_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.event,
        &fx.vault,
        &creator_ata,
        &fx.mint,
        &fx.ctx.token_program,
        0,
    );
    let res = fx.ctx.send(ix, &creator, &[]);
    assert!(res.is_err(), "zero-amount withdraw must fail");
}
