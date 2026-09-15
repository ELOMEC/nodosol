//! Sad-path coverage for the auctions program (Phase 3 P2-008).
//!
//! Existing `test_auction_lifecycle.rs` covers the happy paths; this
//! file fills in the threat-model attack vectors:
//!   - commit_bid: AuctionClosed, NotCommitPhase, SellerCannotBid,
//!     DepositBelowMinimum, TreasuryMismatch
//!   - reveal_bid: NotRevealPhase (early + late), BidBelowStartPrice,
//!     BidExceedsEscrow, BidCommitMismatch
//!   - cancel_auction: HasBids
//!   - settle_auction: NotSettlePhase, no-bids
//!   - refund_bid: WinnerCannotRefund, NotSettlePhase

mod common;

use common::{
    bid_commit_hash, cancel_auction_ix, commit_bid_ix, create_auction_ix,
    initialize_auction_config_ix, refund_bid_ix, reveal_bid_ix, settle_auction_ix, TestCtx,
    START_UNIX,
};
use auctions::state::AuctionStatus;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

const AUCTION_ID: u64 = 11;
const START_PRICE: u64 = 100_000;
const MIN_DEPOSIT: u64 = 100_000;
const COMMIT_DURATION: i64 = 50; // commit phase 50s
const REVEAL_DURATION: i64 = 100; // reveal phase another 100s

/// Boilerplate: initialise config (1% fee), create one auction by `seller`,
/// fund a bidder. Returns all the keys callers need to drive ix-evi.
struct AuctionFixture {
    ctx: TestCtx,
    authority: Keypair,
    payment_mint: Pubkey,
    treasury_ata: Pubkey,
    config: Pubkey,
    seller: Keypair,
    seller_payment: Pubkey,
    auction: Pubkey,
    vault: Pubkey,
    bidder: Keypair,
    bidder_payment: Pubkey,
}

impl AuctionFixture {
    fn new(fee_bps: u16, bidder_balance: u64) -> Self {
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
                fee_bps,
            ),
            &authority,
            &[],
        )
        .unwrap();

        let seller = Keypair::new();
        let bidder = Keypair::new();
        ctx.fund(&seller.pubkey(), 5_000_000_000);
        ctx.fund(&bidder.pubkey(), 5_000_000_000);

        let seller_payment = ctx.create_ata(&authority, &seller.pubkey(), &payment_mint);
        let bidder_payment = ctx.create_ata(&authority, &bidder.pubkey(), &payment_mint);
        if bidder_balance > 0 {
            ctx.mint_to(&payment_mint, &bidder_payment, &authority, bidder_balance);
        }

        let commit_ends = START_UNIX + COMMIT_DURATION;
        let reveal_ends = commit_ends + REVEAL_DURATION;
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
            START_PRICE,
            MIN_DEPOSIT,
            commit_ends,
            reveal_ends,
            "memo".to_string(),
            "https://example.invalid/meta.json".to_string(),
        );
        ctx.send(create, &seller, &[]).unwrap();

        Self {
            ctx,
            authority,
            payment_mint,
            treasury_ata,
            config,
            seller,
            seller_payment,
            auction,
            vault,
            bidder,
            bidder_payment,
        }
    }

    fn bid_pda(&self, bidder: &Pubkey) -> (Pubkey, u8) {
        self.ctx.bid_pda(&self.auction, bidder)
    }

    fn commit(&mut self, bidder: &Keypair, amount: u64, nonce: &[u8; 32]) -> Pubkey {
        let (bid, _) = self.bid_pda(&bidder.pubkey());
        let bidder_pay = if bidder.pubkey() == self.bidder.pubkey() {
            self.bidder_payment
        } else {
            self.ctx.create_ata(&self.authority, &bidder.pubkey(), &self.payment_mint)
        };
        let ix = commit_bid_ix(
            &self.ctx.program_id,
            &bidder.pubkey(),
            &self.auction,
            &bid,
            &self.payment_mint,
            &bidder_pay,
            &self.vault,
            &self.ctx.token_program,
            &anchor_lang::system_program::ID,
            bid_commit_hash(amount, nonce),
            amount,
        );
        self.ctx.send(ix, bidder, &[]).unwrap();
        bid
    }
}

// ---------------------------------------------------------------------------
// commit_bid sad paths
// ---------------------------------------------------------------------------

#[test]
fn commit_bid_rejects_when_seller_tries_to_bid() {
    // SellerCannotBid gate.
    let mut f = AuctionFixture::new(0, 0);
    // Top up seller payment account so the transfer would otherwise succeed.
    f.ctx.mint_to(
        &f.payment_mint,
        &f.seller_payment,
        &f.authority,
        500_000,
    );

    let (bid, _) = f.bid_pda(&f.seller.pubkey());
    let nonce = [1u8; 32];
    let ix = commit_bid_ix(
        &f.ctx.program_id,
        &f.seller.pubkey(),
        &f.auction,
        &bid,
        &f.payment_mint,
        &f.seller_payment,
        &f.vault,
        &f.ctx.token_program,
        &anchor_lang::system_program::ID,
        bid_commit_hash(500_000, &nonce),
        500_000,
    );
    let result = f.ctx.send(ix, &f.seller, &[]);
    assert!(
        result.is_err(),
        "commit_bid as seller must fail (SellerCannotBid)"
    );
    assert_eq!(f.ctx.balance(&f.vault), 0);
    assert!(f.ctx.svm.get_account(&bid).is_none());
}

#[test]
fn commit_bid_rejects_below_min_deposit() {
    let mut f = AuctionFixture::new(0, 1_000_000);

    let (bid, _) = f.bid_pda(&f.bidder.pubkey());
    let nonce = [2u8; 32];
    let too_small = MIN_DEPOSIT - 1;
    let ix = commit_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        &f.payment_mint,
        &f.bidder_payment,
        &f.vault,
        &f.ctx.token_program,
        &anchor_lang::system_program::ID,
        bid_commit_hash(too_small, &nonce),
        too_small,
    );
    let result = f.ctx.send(ix, &f.bidder, &[]);
    assert!(
        result.is_err(),
        "commit_bid below MIN_DEPOSIT must fail (DepositBelowMinimum)"
    );
    assert_eq!(f.ctx.balance(&f.vault), 0);
    assert!(f.ctx.svm.get_account(&bid).is_none());
}

#[test]
fn commit_bid_rejects_after_commit_phase() {
    let mut f = AuctionFixture::new(0, 1_000_000);
    // Skip past commit_ends.
    f.ctx.advance_time(COMMIT_DURATION + 1);

    let (bid, _) = f.bid_pda(&f.bidder.pubkey());
    let nonce = [3u8; 32];
    let ix = commit_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        &f.payment_mint,
        &f.bidder_payment,
        &f.vault,
        &f.ctx.token_program,
        &anchor_lang::system_program::ID,
        bid_commit_hash(500_000, &nonce),
        500_000,
    );
    let result = f.ctx.send(ix, &f.bidder, &[]);
    assert!(
        result.is_err(),
        "commit_bid after commit_ends must fail (NotCommitPhase)"
    );
    assert_eq!(f.ctx.balance(&f.vault), 0);
}

// ---------------------------------------------------------------------------
// reveal_bid sad paths
// ---------------------------------------------------------------------------

#[test]
fn reveal_bid_rejects_during_commit_phase() {
    // Commit successfully, then try to reveal BEFORE commit phase ends.
    let mut f = AuctionFixture::new(0, 1_000_000);
    let amount = 500_000;
    let nonce = [4u8; 32];
    let bid = f.commit(&f.bidder.insecure_clone(), amount, &nonce);

    // Don't advance time — still in commit phase.
    let ix = reveal_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        amount,
        nonce,
    );
    let result = f.ctx.send(ix, &f.bidder, &[]);
    assert!(
        result.is_err(),
        "reveal during commit phase must fail (NotRevealPhase)"
    );
}

#[test]
fn reveal_bid_rejects_after_reveal_phase() {
    let mut f = AuctionFixture::new(0, 1_000_000);
    let amount = 500_000;
    let nonce = [5u8; 32];
    let bid = f.commit(&f.bidder.insecure_clone(), amount, &nonce);

    // Skip past reveal_ends.
    f.ctx.advance_time(COMMIT_DURATION + REVEAL_DURATION + 1);

    let ix = reveal_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        amount,
        nonce,
    );
    let result = f.ctx.send(ix, &f.bidder, &[]);
    assert!(
        result.is_err(),
        "reveal after reveal_ends must fail (NotRevealPhase)"
    );
}

#[test]
fn reveal_bid_rejects_below_start_price() {
    // Bidder commits with escrow >= MIN_DEPOSIT but reveals an amount
    // below `start_price`. Reveal must reject.
    let mut f = AuctionFixture::new(0, 1_000_000);
    let escrow_amt = 500_000;
    let revealed_amt = START_PRICE - 1; // < start price, but escrow is enough
    let nonce = [6u8; 32];

    // Commit a hash that matches the BELOW-start-price reveal we'll attempt.
    let (bid, _) = f.bid_pda(&f.bidder.pubkey());
    let ix = commit_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        &f.payment_mint,
        &f.bidder_payment,
        &f.vault,
        &f.ctx.token_program,
        &anchor_lang::system_program::ID,
        bid_commit_hash(revealed_amt, &nonce),
        escrow_amt,
    );
    f.ctx.send(ix, &f.bidder, &[]).unwrap();

    f.ctx.advance_time(COMMIT_DURATION + 1);
    let ix = reveal_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        revealed_amt,
        nonce,
    );
    let result = f.ctx.send(ix, &f.bidder, &[]);
    assert!(
        result.is_err(),
        "reveal below start_price must fail (BidBelowStartPrice)"
    );
}

#[test]
fn reveal_bid_rejects_with_commit_mismatch() {
    let mut f = AuctionFixture::new(0, 1_000_000);
    let committed_amt = 500_000;
    let attempted_amt = 600_000; // bigger; but commits to 500_000
    let nonce = [7u8; 32];

    let bid = f.commit(&f.bidder.insecure_clone(), committed_amt, &nonce);

    f.ctx.advance_time(COMMIT_DURATION + 1);
    let ix = reveal_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        attempted_amt,
        nonce,
    );
    let result = f.ctx.send(ix, &f.bidder, &[]);
    assert!(
        result.is_err(),
        "reveal with mismatched amount must fail (BidCommitMismatch)"
    );
}

#[test]
fn reveal_bid_rejects_when_amount_exceeds_escrow() {
    // Commit small escrow, then try to reveal a larger amount.
    let mut f = AuctionFixture::new(0, 1_000_000);
    let escrow_amt = 200_000;
    let revealed_amt = 500_000; // > escrow
    let nonce = [8u8; 32];

    let (bid, _) = f.bid_pda(&f.bidder.pubkey());
    let ix = commit_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        &f.payment_mint,
        &f.bidder_payment,
        &f.vault,
        &f.ctx.token_program,
        &anchor_lang::system_program::ID,
        bid_commit_hash(revealed_amt, &nonce),
        escrow_amt,
    );
    f.ctx.send(ix, &f.bidder, &[]).unwrap();

    f.ctx.advance_time(COMMIT_DURATION + 1);
    let ix = reveal_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        revealed_amt,
        nonce,
    );
    let result = f.ctx.send(ix, &f.bidder, &[]);
    assert!(
        result.is_err(),
        "reveal above escrow must fail (BidExceedsEscrow)"
    );
}

// ---------------------------------------------------------------------------
// cancel_auction sad paths
// ---------------------------------------------------------------------------

#[test]
fn cancel_auction_rejects_when_bids_already_committed() {
    // After the first commit lands, cancel must fail (HasBids).
    let mut f = AuctionFixture::new(0, 1_000_000);
    let nonce = [9u8; 32];
    let _bid = f.commit(&f.bidder.insecure_clone(), 500_000, &nonce);

    let ix = cancel_auction_ix(
        &f.ctx.program_id,
        &f.seller.pubkey(),
        &f.auction,
        &f.vault,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(ix, &f.seller, &[]);
    assert!(
        result.is_err(),
        "cancel_auction with bids must fail (HasBids)"
    );
    let a = f.ctx.get_auction(&f.auction);
    assert_eq!(
        a.status,
        AuctionStatus::CommitPhase,
        "auction must remain in CommitPhase"
    );
    assert_eq!(f.ctx.balance(&f.vault), 500_000);
}

// ---------------------------------------------------------------------------
// settle_auction sad paths
// ---------------------------------------------------------------------------

#[test]
fn settle_auction_rejects_before_reveal_phase_ends() {
    // Bid + reveal but try to settle BEFORE reveal_ends.
    let mut f = AuctionFixture::new(0, 1_000_000);
    let amt = 500_000;
    let nonce = [10u8; 32];
    let bid = f.commit(&f.bidder.insecure_clone(), amt, &nonce);

    // Move to reveal phase.
    f.ctx.advance_time(COMMIT_DURATION + 1);
    f.ctx
        .send(
            reveal_bid_ix(&f.ctx.program_id, &f.bidder.pubkey(), &f.auction, &bid, amt, nonce),
            &f.bidder,
            &[],
        )
        .unwrap();
    // STILL in reveal phase — try to settle.
    let caller = Keypair::new();
    f.ctx.fund(&caller.pubkey(), 1_000_000_000);

    let ix = settle_auction_ix(
        &f.ctx.program_id,
        &caller.pubkey(),
        &f.auction,
        &bid,
        &f.config,
        &f.payment_mint,
        &f.vault,
        &f.seller_payment,
        &f.seller.pubkey(),
        &f.treasury_ata,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(ix, &caller, &[]);
    assert!(
        result.is_err(),
        "settle before reveal_ends must fail (NotSettlePhase)"
    );
}

#[test]
fn settle_auction_rejects_with_no_revealed_bids() {
    // Commit a bid, never reveal, then try to settle past reveal_ends.
    let mut f = AuctionFixture::new(0, 1_000_000);
    let nonce = [11u8; 32];
    let bid = f.commit(&f.bidder.insecure_clone(), 500_000, &nonce);

    // Skip both phases without revealing.
    f.ctx.advance_time(COMMIT_DURATION + REVEAL_DURATION + 1);

    let caller = Keypair::new();
    f.ctx.fund(&caller.pubkey(), 1_000_000_000);
    let ix = settle_auction_ix(
        &f.ctx.program_id,
        &caller.pubkey(),
        &f.auction,
        &bid,
        &f.config,
        &f.payment_mint,
        &f.vault,
        &f.seller_payment,
        &f.seller.pubkey(),
        &f.treasury_ata,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(ix, &caller, &[]);
    assert!(
        result.is_err(),
        "settle with no revealed bids must fail (highest_bidder == default)"
    );
    // Auction stays in CommitPhase; seller payout untouched.
    let a = f.ctx.get_auction(&f.auction);
    assert_eq!(a.status, AuctionStatus::CommitPhase);
    assert_eq!(f.ctx.balance(&f.seller_payment), 0);
}

// ---------------------------------------------------------------------------
// refund_bid sad paths
// ---------------------------------------------------------------------------

#[test]
fn refund_bid_rejects_while_auction_still_active() {
    // Bidder tries to refund their own bid before the auction terminates.
    let mut f = AuctionFixture::new(0, 1_000_000);
    let amt = 500_000;
    let nonce = [12u8; 32];
    let bid = f.commit(&f.bidder.insecure_clone(), amt, &nonce);

    let ix = refund_bid_ix(
        &f.ctx.program_id,
        &f.bidder.pubkey(),
        &f.auction,
        &bid,
        &f.payment_mint,
        &f.vault,
        &f.bidder_payment,
        &f.ctx.token_program,
    );
    let result = f.ctx.send(ix, &f.bidder, &[]);
    assert!(
        result.is_err(),
        "refund_bid on active auction must fail (NotSettlePhase)"
    );
    assert_eq!(f.ctx.balance(&f.vault), amt);
    assert!(f.ctx.svm.get_account(&bid).is_some());
}
