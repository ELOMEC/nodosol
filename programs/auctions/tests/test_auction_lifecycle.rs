mod common;

use common::{
    bid_commit_hash, cancel_auction_ix, commit_bid_ix, create_auction_ix, initialize_auction_config_ix,
    refund_bid_ix, reveal_bid_ix, settle_auction_ix, TestCtx, START_UNIX,
};
use auctions::state::{AuctionStatus, BidStatus};
use solana_keypair::Keypair;
use solana_signer::Signer;

const AUCTION_ID: u64 = 7;

#[test]
fn seller_cancels_before_any_bids() {
    let mut ctx = TestCtx::new();
    let seller = Keypair::new();
    ctx.fund(&seller.pubkey(), 5_000_000_000);

    let mint_auth = Keypair::new();
    ctx.fund(&mint_auth.pubkey(), 5_000_000_000);
    let payment_mint = ctx.create_mint(&mint_auth, 6);

    let commit_ends = START_UNIX + 500;
    let reveal_ends = START_UNIX + 1_000;
    let (auction, _) = ctx.auction_pda(&seller.pubkey(), AUCTION_ID);
    let (vault, _) = ctx.vault_pda(&auction);

    let create = create_auction_ix(
        &ctx.program_id,
        &seller.pubkey(),
        &auction,
        &payment_mint,
        &vault,
        &ctx.token_program,
        &anchor_spl::associated_token::ID,
        &anchor_lang::system_program::ID,
        AUCTION_ID,
        1,
        1,
        commit_ends,
        reveal_ends,
        "memo".to_string(),
        "https://example.invalid/meta.json".to_string(),
    );
    ctx.send(create, &seller, &[]).unwrap();

    let cancel = cancel_auction_ix(
        &ctx.program_id,
        &seller.pubkey(),
        &auction,
        &vault,
        &ctx.token_program,
    );
    ctx.send(cancel, &seller, &[]).unwrap();
    assert!(ctx.svm.get_account(&auction).is_none());
}

#[test]
fn commit_reveal_settle_pays_seller_and_treasury() {
    let mut ctx = TestCtx::new();
    let authority = Keypair::new();
    ctx.fund(&authority.pubkey(), 5_000_000_000);

    let payment_mint = ctx.create_mint(&authority, 6);
    let treasury_ata = ctx.create_ata(&authority, &authority.pubkey(), &payment_mint);
    let (config, _) = ctx.config_pda();

    let init = initialize_auction_config_ix(
        &ctx.program_id,
        &authority.pubkey(),
        &config,
        &payment_mint,
        &treasury_ata,
        100, // 1%
    );
    ctx.send(init, &authority, &[]).unwrap();

    let seller = Keypair::new();
    let bidder = Keypair::new();
    ctx.fund(&seller.pubkey(), 5_000_000_000);
    ctx.fund(&bidder.pubkey(), 5_000_000_000);

    let seller_payment = ctx.create_ata(&authority, &seller.pubkey(), &payment_mint);
    let bidder_payment = ctx.create_ata(&authority, &bidder.pubkey(), &payment_mint);
    ctx.mint_to(
        &payment_mint,
        &bidder_payment,
        &authority,
        10_000_000_000,
    );

    let commit_ends = START_UNIX + 50;
    let reveal_ends = START_UNIX + 100;
    let (auction, _) = ctx.auction_pda(&seller.pubkey(), AUCTION_ID);
    let (vault, _) = ctx.vault_pda(&auction);

    let create = create_auction_ix(
        &ctx.program_id,
        &seller.pubkey(),
        &auction,
        &payment_mint,
        &vault,
        &ctx.token_program,
        &anchor_spl::associated_token::ID,
        &anchor_lang::system_program::ID,
        AUCTION_ID,
        100_000,
        100_000,
        commit_ends,
        reveal_ends,
        "unit".to_string(),
        "https://example.invalid/a.json".to_string(),
    );
    ctx.send(create, &seller, &[]).unwrap();

    let bid_amount: u64 = 500_000;
    let nonce = [9u8; 32];
    let commit = bid_commit_hash(bid_amount, &nonce);
    let (bid_pda, _) = ctx.bid_pda(&auction, &bidder.pubkey());
    let escrow = bid_amount;

    let commit_ix = commit_bid_ix(
        &ctx.program_id,
        &bidder.pubkey(),
        &auction,
        &bid_pda,
        &payment_mint,
        &bidder_payment,
        &vault,
        &ctx.token_program,
        &anchor_lang::system_program::ID,
        commit,
        escrow,
    );
    ctx.send(commit_ix, &bidder, &[]).unwrap();
    assert_eq!(ctx.balance(&vault), escrow);

    ctx.advance_time(60);
    let reveal = reveal_bid_ix(
        &ctx.program_id,
        &bidder.pubkey(),
        &auction,
        &bid_pda,
        bid_amount,
        nonce,
    );
    ctx.send(reveal, &bidder, &[]).unwrap();

    ctx.advance_time(60);
    let caller = Keypair::new();
    ctx.fund(&caller.pubkey(), 1_000_000_000);

    let settle = settle_auction_ix(
        &ctx.program_id,
        &caller.pubkey(),
        &auction,
        &bid_pda,
        &config,
        &payment_mint,
        &vault,
        &seller_payment,
        &seller.pubkey(),
        &treasury_ata,
        &ctx.token_program,
    );
    ctx.send(settle, &caller, &[]).unwrap();

    let fee = 5_000; // 1% of 500_000
    let seller_share = 495_000;
    assert_eq!(ctx.balance(&treasury_ata), fee);
    assert_eq!(ctx.balance(&seller_payment), seller_share);

    let a = ctx.get_auction(&auction);
    assert_eq!(a.status, AuctionStatus::Settled);
    assert_eq!(ctx.get_bid(&bid_pda).status, BidStatus::Won);
}

#[test]
fn losing_bidder_refunds_after_settle() {
    let mut ctx = TestCtx::new();
    let authority = Keypair::new();
    ctx.fund(&authority.pubkey(), 5_000_000_000);

    let payment_mint = ctx.create_mint(&authority, 6);
    let treasury_ata = ctx.create_ata(&authority, &authority.pubkey(), &payment_mint);
    let (config, _) = ctx.config_pda();
    ctx.send(
        initialize_auction_config_ix(
            &ctx.program_id,
            &authority.pubkey(),
            &config,
            &payment_mint,
            &treasury_ata,
            0,
        ),
        &authority,
        &[],
    )
    .unwrap();

    let seller = Keypair::new();
    let alice = Keypair::new();
    let bob = Keypair::new();
    for k in [&seller, &alice, &bob] {
        ctx.fund(&k.pubkey(), 5_000_000_000);
    }

    let seller_payment = ctx.create_ata(&authority, &seller.pubkey(), &payment_mint);
    let alice_pay = ctx.create_ata(&authority, &alice.pubkey(), &payment_mint);
    let bob_pay = ctx.create_ata(&authority, &bob.pubkey(), &payment_mint);
    ctx.mint_to(&payment_mint, &alice_pay, &authority, 20_000_000);
    ctx.mint_to(&payment_mint, &bob_pay, &authority, 20_000_000_000);

    let commit_ends = START_UNIX + 40;
    let reveal_ends = START_UNIX + 120;
    let auction_id: u64 = 99;
    let (auction, _) = ctx.auction_pda(&seller.pubkey(), auction_id);
    let (vault, _) = ctx.vault_pda(&auction);

    let create = create_auction_ix(
        &ctx.program_id,
        &seller.pubkey(),
        &auction,
        &payment_mint,
        &vault,
        &ctx.token_program,
        &anchor_spl::associated_token::ID,
        &anchor_lang::system_program::ID,
        auction_id,
        50_000,
        50_000,
        commit_ends,
        reveal_ends,
        "m".to_string(),
        "https://example.invalid/b.json".to_string(),
    );
    ctx.send(create, &seller, &[]).unwrap();

    let alice_nonce = [1u8; 32];
    let alice_amount: u64 = 200_000;
    let alice_escrow = 300_000;
    let (alice_bid, _) = ctx.bid_pda(&auction, &alice.pubkey());
    ctx.send(
        commit_bid_ix(
            &ctx.program_id,
            &alice.pubkey(),
            &auction,
            &alice_bid,
            &payment_mint,
            &alice_pay,
            &vault,
            &ctx.token_program,
            &anchor_lang::system_program::ID,
            bid_commit_hash(alice_amount, &alice_nonce),
            alice_escrow,
        ),
        &alice,
        &[],
    )
    .unwrap();

    let bob_nonce = [2u8; 32];
    let bob_amount: u64 = 400_000;
    let bob_escrow = 500_000;
    let (bob_bid, _) = ctx.bid_pda(&auction, &bob.pubkey());
    ctx.send(
        commit_bid_ix(
            &ctx.program_id,
            &bob.pubkey(),
            &auction,
            &bob_bid,
            &payment_mint,
            &bob_pay,
            &vault,
            &ctx.token_program,
            &anchor_lang::system_program::ID,
            bid_commit_hash(bob_amount, &bob_nonce),
            bob_escrow,
        ),
        &bob,
        &[],
    )
    .unwrap();

    ctx.advance_time(50);
    ctx.send(
        reveal_bid_ix(
            &ctx.program_id,
            &alice.pubkey(),
            &auction,
            &alice_bid,
            alice_amount,
            alice_nonce,
        ),
        &alice,
        &[],
    )
    .unwrap();
    ctx.send(
        reveal_bid_ix(
            &ctx.program_id,
            &bob.pubkey(),
            &auction,
            &bob_bid,
            bob_amount,
            bob_nonce,
        ),
        &bob,
        &[],
    )
    .unwrap();

    ctx.advance_time(100);
    let caller = Keypair::new();
    ctx.fund(&caller.pubkey(), 1_000_000_000);
    ctx.send(
        settle_auction_ix(
            &ctx.program_id,
            &caller.pubkey(),
            &auction,
            &bob_bid,
            &config,
            &payment_mint,
            &vault,
            &seller_payment,
            &seller.pubkey(),
            &treasury_ata,
            &ctx.token_program,
        ),
        &caller,
        &[],
    )
    .unwrap();

    assert_eq!(ctx.balance(&seller_payment), bob_amount);

    let alice_before = ctx.balance(&alice_pay);
    ctx.send(
        refund_bid_ix(
            &ctx.program_id,
            &alice.pubkey(),
            &auction,
            &alice_bid,
            &payment_mint,
            &vault,
            &alice_pay,
            &ctx.token_program,
        ),
        &alice,
        &[],
    )
    .unwrap();
    assert_eq!(ctx.balance(&alice_pay), alice_before + alice_escrow);
}
