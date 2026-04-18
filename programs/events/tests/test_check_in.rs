mod common;

use common::{check_in_ix, EventFixture, USDC_UNIT};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn setup_with_ticket() -> (EventFixture, Keypair, solana_pubkey::Pubkey) {
    let mut fx = EventFixture::new(USDC_UNIT, 10);
    let (attendee, attendee_ata, ticket) = fx.new_attendee(100 * USDC_UNIT);
    fx.buy(&attendee, &attendee_ata, &ticket).unwrap();
    (fx, attendee, ticket)
}

#[test]
fn check_in_marks_ticket_and_increments_counter() {
    let (mut fx, _attendee, ticket) = setup_with_ticket();

    let creator = fx.creator.insecure_clone();
    let ix = check_in_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.event,
        &ticket,
    );
    fx.ctx.send(ix, &creator, &[]).unwrap();

    let t = fx.ctx.get_ticket(&ticket);
    assert!(t.checked_in);
    assert_eq!(t.checked_in_at, fx.ctx.now());

    let event = fx.ctx.get_event(&fx.event);
    assert_eq!(event.checked_in_count, 1);
}

#[test]
fn check_in_rejects_non_creator() {
    let (mut fx, _attendee, ticket) = setup_with_ticket();

    let attacker = Keypair::new();
    fx.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = check_in_ix(
        &fx.ctx.program_id,
        &attacker.pubkey(),
        &fx.event,
        &ticket,
    );
    let res = fx.ctx.send(ix, &attacker, &[]);
    assert!(res.is_err(), "non-creator check-in must fail");
}

#[test]
fn check_in_rejects_double_check_in() {
    let (mut fx, _attendee, ticket) = setup_with_ticket();

    let creator = fx.creator.insecure_clone();

    let ix1 = check_in_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.event,
        &ticket,
    );
    fx.ctx.send(ix1, &creator, &[]).unwrap();

    let ix2 = check_in_ix(
        &fx.ctx.program_id,
        &creator.pubkey(),
        &fx.event,
        &ticket,
    );
    let res = fx.ctx.send(ix2, &creator, &[]);
    assert!(res.is_err(), "double check-in must fail");
}
