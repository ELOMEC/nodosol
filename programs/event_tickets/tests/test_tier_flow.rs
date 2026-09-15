mod common;

use common::{
    buy_tier_ticket_ix, create_event_ix, create_tier_ix, initialize_event_tree_ix,
    make_create_merkle_tree_account_ix, update_tier_capacity_ix, update_tier_status_ix,
    BuyTierTicketAccounts, Fixture, MERKLE_TREE_ACCOUNT_SIZE, START_UNIX,
};
use event_tickets::state::TierStatus;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

const EVENT_ID: u64 = 42;
const EVENT_PRICE: u64 = 5_000_000; // 5 USDC default — overridden by tier
const EVENT_CAPACITY: u64 = 100;

const VIP_TIER_ID: u16 = 0;
const VIP_PRICE: u64 = 50_000_000; // 50 USDC
const VIP_CAPACITY: u32 = 2;
const VIP_COLOR: [u8; 6] = *b"FF5733";

const GA_TIER_ID: u16 = 1;
const GA_PRICE: u64 = 10_000_000;

/// Spin up an event + tree + a VIP tier in one helper. Returns the
/// account keys callers need to drive buy_tier_ticket / update_tier_*.
fn seed_event_with_vip_tier(
    f: &mut Fixture,
) -> (Pubkey, Pubkey, Pubkey, Pubkey, Pubkey, Keypair) {
    let (event, _) = f.ctx.event_pda(&f.creator.pubkey(), EVENT_ID);
    let (vault, _) = f.ctx.vault_pda(&event);
    let create_event = create_event_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &f.payment_mint,
        &event,
        &vault,
        &f.ctx.token_program,
        EVENT_ID,
        EVENT_PRICE,
        EVENT_CAPACITY,
        START_UNIX,
        START_UNIX + 86_400,
        "Tier Flow Test".into(),
        "TFT".into(),
        "https://nodosol.com/tier-flow.json".into(),
    );
    f.ctx.send(vec![create_event], &f.creator, &[]).unwrap();

    let merkle_tree_kp = Keypair::new();
    let (tree_config, _) = f.ctx.tree_config_pda(&merkle_tree_kp.pubkey());
    let rent = f
        .ctx
        .svm
        .minimum_balance_for_rent_exemption(MERKLE_TREE_ACCOUNT_SIZE as usize);
    let create_tree_acc =
        make_create_merkle_tree_account_ix(&f.creator.pubkey(), &merkle_tree_kp.pubkey(), rent);
    let init_tree = initialize_event_tree_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        &tree_config,
        &merkle_tree_kp.pubkey(),
    );
    f.ctx
        .send(vec![create_tree_acc, init_tree], &f.creator, &[&merkle_tree_kp])
        .unwrap();

    let (tier, _) = f.ctx.tier_pda(&event, VIP_TIER_ID);
    let create_tier = create_tier_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        &tier,
        VIP_TIER_ID,
        "VIP".into(),
        "FRONT".into(),
        VIP_PRICE,
        VIP_CAPACITY,
        VIP_COLOR,
    );
    f.ctx.send(vec![create_tier], &f.creator, &[]).unwrap();

    (event, vault, tier, tree_config, merkle_tree_kp.pubkey(), merkle_tree_kp)
}

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

#[test]
fn create_tier_initialises_with_active_status() {
    let mut f = Fixture::new_with_fee(0, 0);
    let (event, _vault, tier, _tree_config, _merkle_tree, _kp) =
        seed_event_with_vip_tier(&mut f);

    let state = f.ctx.get_tier(&tier);
    assert_eq!(state.event, event);
    assert_eq!(state.tier_id, VIP_TIER_ID);
    assert_eq!(state.price, VIP_PRICE);
    assert_eq!(state.capacity, VIP_CAPACITY);
    assert_eq!(state.sold, 0);
    assert_eq!(state.status, TierStatus::Active);
    assert_eq!(state.name, "VIP");
}

#[test]
fn buy_tier_ticket_charges_tier_price_and_increments_sold() {
    // 1% platform fee. Buyer has 200 USDC → enough for full VIP capacity.
    let mut f = Fixture::new_with_fee(100, 200_000_000);
    let (event, vault, tier, tree_config, merkle_tree, _kp) =
        seed_event_with_vip_tier(&mut f);

    let ix = buy_tier_ticket_ix(
        &f.ctx.program_id,
        BuyTierTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            tier: &tier,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        "A".into(),
        7,
    );
    f.ctx.send(vec![ix], &f.buyer, &[]).unwrap();

    // fee = 50 USDC * 1% = 0.5; creator vault gets 49.5 USDC.
    assert_eq!(f.ctx.balance(&f.treasury), 500_000);
    assert_eq!(f.ctx.balance(&vault), 49_500_000);
    assert_eq!(f.ctx.balance(&f.buyer_payment_ata), 200_000_000 - VIP_PRICE);

    let tier_state = f.ctx.get_tier(&tier);
    assert_eq!(tier_state.sold, 1);

    let event_state = f.ctx.get_event(&event);
    assert_eq!(event_state.sold, 1);
    assert_eq!(event_state.total_revenue, 49_500_000);
}

// ---------------------------------------------------------------------------
// Sad paths — auth + state machine
// ---------------------------------------------------------------------------

#[test]
fn create_tier_rejects_when_signer_is_not_event_creator() {
    let mut f = Fixture::new_with_fee(0, 0);
    let (event, _, _, _, _, _kp) = seed_event_with_vip_tier(&mut f);

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let (tier, _) = f.ctx.tier_pda(&event, GA_TIER_ID);
    let ix = create_tier_ix(
        &f.ctx.program_id,
        &attacker.pubkey(),
        &event,
        &tier,
        GA_TIER_ID,
        "GA".into(),
        "BACK".into(),
        GA_PRICE,
        50,
        *b"00FF00",
    );
    let result = f.ctx.send(vec![ix], &attacker, &[]);
    assert!(
        result.is_err(),
        "create_tier with non-creator signer must fail (NotCreator)"
    );
    assert!(
        f.ctx.svm.get_account(&tier).is_none(),
        "tier PDA must not be initialised when create_tier rejects"
    );
}

#[test]
fn update_tier_status_rejects_when_signer_is_not_event_creator() {
    let mut f = Fixture::new_with_fee(0, 0);
    let (event, _, tier, _, _, _kp) = seed_event_with_vip_tier(&mut f);

    let attacker = Keypair::new();
    f.ctx.fund(&attacker.pubkey(), 5_000_000_000);

    let ix = update_tier_status_ix(
        &f.ctx.program_id,
        &attacker.pubkey(),
        &event,
        &tier,
        TierStatus::Closed,
    );
    let result = f.ctx.send(vec![ix], &attacker, &[]);
    assert!(
        result.is_err(),
        "update_tier_status with non-creator must fail"
    );

    let state = f.ctx.get_tier(&tier);
    assert_eq!(
        state.status,
        TierStatus::Active,
        "tier status must stay Active after rejected update"
    );
}

#[test]
fn update_tier_capacity_rejects_below_already_sold() {
    // Sell one VIP ticket then try to shrink capacity below sold count.
    let mut f = Fixture::new_with_fee(0, 200_000_000);
    let (event, vault, tier, tree_config, merkle_tree, _kp) =
        seed_event_with_vip_tier(&mut f);

    let buy = buy_tier_ticket_ix(
        &f.ctx.program_id,
        BuyTierTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            tier: &tier,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        "A".into(),
        1,
    );
    f.ctx.send(vec![buy], &f.buyer, &[]).unwrap();

    let shrink = update_tier_capacity_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        &tier,
        0, // below sold = 1
    );
    let result = f.ctx.send(vec![shrink], &f.creator, &[]);
    assert!(
        result.is_err(),
        "update_tier_capacity below sold must fail (CapacityBelowSold)"
    );

    let state = f.ctx.get_tier(&tier);
    assert_eq!(state.capacity, VIP_CAPACITY, "capacity must be unchanged");
}

#[test]
fn buy_tier_ticket_rejects_when_tier_paused() {
    // Creator pauses the tier; further buys must be blocked.
    let mut f = Fixture::new_with_fee(0, 200_000_000);
    let (event, vault, tier, tree_config, merkle_tree, _kp) =
        seed_event_with_vip_tier(&mut f);

    let pause = update_tier_status_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        &tier,
        TierStatus::Paused,
    );
    f.ctx.send(vec![pause], &f.creator, &[]).unwrap();

    let buy = buy_tier_ticket_ix(
        &f.ctx.program_id,
        BuyTierTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            tier: &tier,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        "A".into(),
        1,
    );
    let result = f.ctx.send(vec![buy], &f.buyer, &[]);
    assert!(
        result.is_err(),
        "buy_tier_ticket on Paused tier must fail (TierNotActive)"
    );

    assert_eq!(f.ctx.balance(&vault), 0, "no funds should have moved");
    assert_eq!(f.ctx.get_tier(&tier).sold, 0);
}

#[test]
fn buy_tier_ticket_rejects_when_tier_sold_out() {
    // VIP capacity = 2. Sell two tickets, then a third buy must fail.
    // Buyer needs 3 × 50 USDC = 150 USDC.
    let mut f = Fixture::new_with_fee(0, 200_000_000);
    let (event, vault, tier, tree_config, merkle_tree, _kp) =
        seed_event_with_vip_tier(&mut f);

    for seat in 1u16..=2 {
        let buy = buy_tier_ticket_ix(
            &f.ctx.program_id,
            BuyTierTicketAccounts {
                buyer: &f.buyer.pubkey(),
                event: &event,
                tier: &tier,
                vault: &vault,
                payment_mint: &f.payment_mint,
                buyer_payment_account: &f.buyer_payment_ata,
                config: &f.config,
                treasury: &f.treasury,
                token_program: &f.ctx.token_program,
                tree_config: &tree_config,
                merkle_tree: &merkle_tree,
            },
            "A".into(),
            seat,
        );
        f.ctx.send(vec![buy], &f.buyer, &[]).unwrap();
    }
    assert_eq!(f.ctx.get_tier(&tier).sold, VIP_CAPACITY);

    // Third buy past capacity → must fail without taking funds.
    let bal_before = f.ctx.balance(&f.buyer_payment_ata);
    let vault_before = f.ctx.balance(&vault);
    let third = buy_tier_ticket_ix(
        &f.ctx.program_id,
        BuyTierTicketAccounts {
            buyer: &f.buyer.pubkey(),
            event: &event,
            tier: &tier,
            vault: &vault,
            payment_mint: &f.payment_mint,
            buyer_payment_account: &f.buyer_payment_ata,
            config: &f.config,
            treasury: &f.treasury,
            token_program: &f.ctx.token_program,
            tree_config: &tree_config,
            merkle_tree: &merkle_tree,
        },
        "A".into(),
        3,
    );
    let result = f.ctx.send(vec![third], &f.buyer, &[]);
    assert!(
        result.is_err(),
        "third buy on sold-out tier must fail (TierSoldOut)"
    );
    assert_eq!(f.ctx.balance(&f.buyer_payment_ata), bal_before);
    assert_eq!(f.ctx.balance(&vault), vault_before);
    assert_eq!(f.ctx.get_tier(&tier).sold, VIP_CAPACITY);
}

#[test]
fn create_tier_rejects_when_name_too_long() {
    // MAX_TIER_NAME_LEN = 48; supply 49 chars.
    let mut f = Fixture::new_with_fee(0, 0);
    let (event, _vault, _tier_vip, _tc, _mt, _kp) = seed_event_with_vip_tier(&mut f);

    let (tier, _) = f.ctx.tier_pda(&event, GA_TIER_ID);
    let too_long = "X".repeat(49);
    let ix = create_tier_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        &tier,
        GA_TIER_ID,
        too_long,
        "BACK".into(),
        GA_PRICE,
        50,
        *b"00FF00",
    );
    let result = f.ctx.send(vec![ix], &f.creator, &[]);
    assert!(
        result.is_err(),
        "create_tier with name > MAX_TIER_NAME_LEN must fail (TierNameTooLong)"
    );
    assert!(f.ctx.svm.get_account(&tier).is_none());
}

#[test]
fn create_tier_rejects_when_price_zero_or_capacity_zero() {
    // Two related sad paths in one test — both should reject before account init.
    let mut f = Fixture::new_with_fee(0, 0);
    let (event, _vault, _tier_vip, _tc, _mt, _kp) = seed_event_with_vip_tier(&mut f);

    // Price = 0
    let (tier_a, _) = f.ctx.tier_pda(&event, GA_TIER_ID);
    let ix_zero_price = create_tier_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        &tier_a,
        GA_TIER_ID,
        "GA".into(),
        "BACK".into(),
        0,
        50,
        *b"00FF00",
    );
    assert!(
        f.ctx.send(vec![ix_zero_price], &f.creator, &[]).is_err(),
        "create_tier with price=0 must fail (InvalidPrice)"
    );
    assert!(f.ctx.svm.get_account(&tier_a).is_none());

    // Capacity = 0
    let (tier_b, _) = f.ctx.tier_pda(&event, GA_TIER_ID + 1);
    let ix_zero_cap = create_tier_ix(
        &f.ctx.program_id,
        &f.creator.pubkey(),
        &event,
        &tier_b,
        GA_TIER_ID + 1,
        "GA".into(),
        "BACK".into(),
        GA_PRICE,
        0,
        *b"00FF00",
    );
    assert!(
        f.ctx.send(vec![ix_zero_cap], &f.creator, &[]).is_err(),
        "create_tier with capacity=0 must fail (InvalidCapacity)"
    );
    assert!(f.ctx.svm.get_account(&tier_b).is_none());
}
