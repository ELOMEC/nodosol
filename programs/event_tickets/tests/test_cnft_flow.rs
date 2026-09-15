mod common;

use common::{
    buy_ticket_ix, create_event_ix, initialize_event_tree_ix, make_create_merkle_tree_account_ix,
    withdraw_event_revenue_ix, BuyTicketAccounts, Fixture, MERKLE_TREE_ACCOUNT_SIZE, START_UNIX,
};
use event_tickets::state::EventStatus;
use solana_keypair::Keypair;
use solana_signer::Signer;

const EVENT_ID: u64 = 1;
const PRICE: u64 = 10_000_000; // 10 USDC
const CAPACITY: u64 = 50;

fn seed_event(f: &mut Fixture, fee_bps_is_zero: bool) -> (solana_pubkey::Pubkey, solana_pubkey::Pubkey, Keypair) {
    let _ = fee_bps_is_zero;
    let (event, _) = f.ctx.event_pda(&f.creator.pubkey(), EVENT_ID);
    let (vault, _) = f.ctx.vault_pda(&event);
    let ix = create_event_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &f.payment_mint,
        &event,
        &vault,
        &f.ctx.token_program,
        EVENT_ID,
        PRICE,
        CAPACITY,
        START_UNIX,
        START_UNIX + 86_400,
        "Nodosol Demo Night".into(),
        "NDN".into(),
        "https://nodosol.com/demo-night.json".into(),
    );
    f.ctx.send(vec![ix], &f.creator, &[]).unwrap();
    let merkle_tree_kp = Keypair::new();
    (event, vault, merkle_tree_kp)
}

fn initialize_tree(
    f: &mut Fixture,
    event: &solana_pubkey::Pubkey,
    merkle_tree_kp: &Keypair,
) -> (solana_pubkey::Pubkey, solana_pubkey::Pubkey) {
    let (tree_config, _) = f.ctx.tree_config_pda(&merkle_tree_kp.pubkey());

    let rent = f
        .ctx
        .svm
        .minimum_balance_for_rent_exemption(MERKLE_TREE_ACCOUNT_SIZE as usize);
    let create_acc = make_create_merkle_tree_account_ix(
        &f.creator.pubkey(),
        &merkle_tree_kp.pubkey(),
        rent,
    );
    let init_tree = initialize_event_tree_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        event,
        &tree_config,
        &merkle_tree_kp.pubkey(),
    );
    f.ctx
        .send(vec![create_acc, init_tree], &f.creator, &[merkle_tree_kp])
        .unwrap();

    (tree_config, merkle_tree_kp.pubkey())
}

#[test]
fn tree_init_marks_event_ready_for_sales() {
    let mut f = Fixture::new_with_fee(0, 0);
    let (event, _vault, merkle_tree_kp) = seed_event(&mut f, true);
    let (tree_config, merkle_tree) = initialize_tree(&mut f, &event, &merkle_tree_kp);

    let state = f.ctx.get_event(&event);
    assert!(state.tree_initialised);
    assert_eq!(state.merkle_tree, merkle_tree);
    assert_eq!(state.status, EventStatus::Active);
    let _ = tree_config;
}

#[test]
fn buy_ticket_mints_cnft_and_splits_fee() {
    // 2.5% platform fee, buyer has 100 USDC.
    let mut f = Fixture::new_with_fee(250, 100_000_000);
    let (event, vault, merkle_tree_kp) = seed_event(&mut f, false);
    let (tree_config, merkle_tree) = initialize_tree(&mut f, &event, &merkle_tree_kp);

    let ix = buy_ticket_ix(
        &f.ctx.program_id,
        BuyTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
    );
    f.ctx.send(vec![ix], &f.buyer, &[]).unwrap();

    // fee = 10 USDC * 250 / 10000 = 0.25 USDC; creator vault gets 9.75 USDC.
    assert_eq!(f.ctx.balance(&f.treasury), 250_000);
    assert_eq!(f.ctx.balance(&vault), 9_750_000);
    assert_eq!(f.ctx.balance(&f.buyer_payment_ata), 100_000_000 - PRICE);

    let state = f.ctx.get_event(&event);
    assert_eq!(state.sold, 1);
    assert_eq!(state.total_revenue, 9_750_000);
}

#[test]
fn buy_ticket_rejects_before_tree_init() {
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, vault, merkle_tree_kp) = seed_event(&mut f, true);
    let (tree_config, _) = f.ctx.tree_config_pda(&merkle_tree_kp.pubkey());

    let ix = buy_ticket_ix(
        &f.ctx.program_id,
        BuyTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree_kp.pubkey(),
        },
    );
    let result = f.ctx.send(vec![ix], &f.buyer, &[]);
    assert!(result.is_err(), "buy before tree init must fail");
}

#[test]
fn buy_ticket_rejects_after_sale_end() {
    // Phase 3 sad-path: time-gated rejection.
    // seed_event sets sale_ends_at = START_UNIX + 86_400 (1 day). Push the
    // clock past that and the buy must fail with `SaleEnded`.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, vault, merkle_tree_kp) = seed_event(&mut f, true);
    let (tree_config, merkle_tree) = initialize_tree(&mut f, &event, &merkle_tree_kp);

    f.ctx.advance_time(86_401);

    let ix = buy_ticket_ix(
        &f.ctx.program_id,
        BuyTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
    );
    let result = f.ctx.send(vec![ix], &f.buyer, &[]);
    assert!(
        result.is_err(),
        "buy after sale_ends_at must fail (SaleEnded gate)"
    );

    // Vault stays empty + buyer keeps full balance — no partial settlement.
    assert_eq!(f.ctx.balance(&vault), 0);
    assert_eq!(f.ctx.balance(&f.buyer_payment_ata), 50_000_000);
}

#[test]
fn buy_ticket_rejects_when_event_closed() {
    // Phase 3 sad-path: state-machine rejection.
    // Creator closes the event before any sales — buyer attempt must fail.
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, vault, merkle_tree_kp) = seed_event(&mut f, true);
    let (tree_config, merkle_tree) = initialize_tree(&mut f, &event, &merkle_tree_kp);

    let close = common::update_event_status_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        EventStatus::Closed,
    );
    f.ctx.send(vec![close], &f.creator, &[]).unwrap();

    let buy = buy_ticket_ix(
        &f.ctx.program_id,
        BuyTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
    );
    let result = f.ctx.send(vec![buy], &f.buyer, &[]);
    assert!(
        result.is_err(),
        "buy on cancelled event must fail (EventNotActive gate)"
    );
    assert_eq!(f.ctx.balance(&vault), 0);
}

#[test]
fn creator_withdraws_event_revenue() {
    let mut f = Fixture::new_with_fee(0, 50_000_000);
    let (event, vault, merkle_tree_kp) = seed_event(&mut f, true);
    let (tree_config, merkle_tree) = initialize_tree(&mut f, &event, &merkle_tree_kp);

    let buy = buy_ticket_ix(
        &f.ctx.program_id,
        BuyTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
    );
    f.ctx.send(vec![buy], &f.buyer, &[]).unwrap();

    assert_eq!(f.ctx.balance(&vault), PRICE);
    let withdraw = withdraw_event_revenue_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        &f.payment_mint,
        &vault,
        &f.creator_payment_ata,
        &f.ctx.token_program,
        PRICE,
    );
    f.ctx.send(vec![withdraw], &f.creator, &[]).unwrap();

    assert_eq!(f.ctx.balance(&vault), 0);
    assert_eq!(f.ctx.balance(&f.creator_payment_ata), PRICE);
    let state = f.ctx.get_event(&event);
    assert_eq!(state.total_withdrawn, PRICE);
    assert_eq!(state.withdrawable(), 0);
}
