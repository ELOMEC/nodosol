mod common;

use common::{EventFixture, DAY, USDC_UNIT};
use solana_signer::Signer;

#[test]
fn buy_ticket_charges_and_issues_sequential_numbers() {
    let price = 5 * USDC_UNIT;
    let mut fx = EventFixture::new(price, 10);

    let (a1, a1_ata, t1) = fx.new_attendee(100 * USDC_UNIT);
    let (a2, a2_ata, t2) = fx.new_attendee(100 * USDC_UNIT);

    fx.buy(&a1, &a1_ata, &t1).unwrap();
    fx.buy(&a2, &a2_ata, &t2).unwrap();

    let t1_data = fx.ctx.get_ticket(&t1);
    let t2_data = fx.ctx.get_ticket(&t2);
    assert_eq!(t1_data.ticket_number, 1);
    assert_eq!(t1_data.attendee, a1.pubkey());
    assert_eq!(t1_data.price_paid, price);
    assert!(!t1_data.checked_in);
    assert_eq!(t2_data.ticket_number, 2);

    assert_eq!(fx.ctx.token_balance(&a1_ata), 100 * USDC_UNIT - price);
    assert_eq!(fx.ctx.token_balance(&fx.vault), 2 * price);

    let event = fx.ctx.get_event(&fx.event);
    assert_eq!(event.sold_count, 2);
    assert_eq!(event.total_revenue, 2 * price);
}

#[test]
fn buy_ticket_rejects_capacity_reached() {
    let price = USDC_UNIT;
    let mut fx = EventFixture::new(price, 1);

    let (a1, a1_ata, t1) = fx.new_attendee(100 * USDC_UNIT);
    fx.buy(&a1, &a1_ata, &t1).unwrap();

    let (a2, a2_ata, t2) = fx.new_attendee(100 * USDC_UNIT);
    let res = fx.buy(&a2, &a2_ata, &t2);
    assert!(res.is_err(), "second buyer past capacity must fail");
}

#[test]
fn buy_ticket_rejects_before_start() {
    let price = USDC_UNIT;
    // Event starts 1 day from now.
    let mut fx = EventFixture::new_with_window(price, 0, DAY, DAY);

    let (a, a_ata, ticket) = fx.new_attendee(100 * USDC_UNIT);
    let res = fx.buy(&a, &a_ata, &ticket);
    assert!(res.is_err(), "buy before event starts must fail");
}

#[test]
fn buy_ticket_rejects_after_end() {
    let price = USDC_UNIT;
    // Event window is [now, now + 1 day).
    let mut fx = EventFixture::new_with_window(price, 0, 0, DAY);

    let (a, a_ata, ticket) = fx.new_attendee(100 * USDC_UNIT);
    fx.ctx.advance_time(DAY + 1);

    let res = fx.buy(&a, &a_ata, &ticket);
    assert!(res.is_err(), "buy after event ends must fail");
}

#[test]
fn buy_ticket_rejects_second_purchase_by_same_attendee() {
    let price = USDC_UNIT;
    let mut fx = EventFixture::new(price, 0);

    let (a, a_ata, ticket) = fx.new_attendee(100 * USDC_UNIT);
    fx.buy(&a, &a_ata, &ticket).unwrap();

    let res = fx.buy(&a, &a_ata, &ticket);
    assert!(res.is_err(), "same attendee buying twice must fail");
}

#[test]
fn buy_ticket_supports_free_events() {
    let mut fx = EventFixture::new(0, 0);
    // Attendee has no USDC and didn't fund the ATA — should still work.
    let (a, a_ata, ticket) = fx.new_attendee(0);

    fx.buy(&a, &a_ata, &ticket).unwrap();
    let t = fx.ctx.get_ticket(&ticket);
    assert_eq!(t.price_paid, 0);
    assert_eq!(fx.ctx.token_balance(&fx.vault), 0);
}

#[test]
fn buy_ticket_fails_when_attendee_has_insufficient_balance() {
    let price = 10 * USDC_UNIT;
    let mut fx = EventFixture::new(price, 0);

    let (a, a_ata, ticket) = fx.new_attendee(price - 1);
    let res = fx.buy(&a, &a_ata, &ticket);
    assert!(res.is_err(), "insufficient balance must fail");
}
