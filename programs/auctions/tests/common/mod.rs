#![allow(dead_code)]

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    anchor_spl::token_interface::spl_token_2022,
    auctions::state::{Auction, AuctionConfig, SealedBid},
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const USDC_DECIMALS: u8 = 6;
pub const START_UNIX: i64 = 1_735_689_600;

pub struct TestCtx {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    pub token_program: Pubkey,
}

impl TestCtx {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let program_id = auctions::id();
        let bytes = include_bytes!("../../../../target/deploy/auctions.so");
        svm.add_program(program_id, bytes).unwrap();

        let mut clock = svm.get_sysvar::<solana_clock::Clock>();
        clock.unix_timestamp = START_UNIX;
        svm.set_sysvar::<solana_clock::Clock>(&clock);

        Self {
            svm,
            program_id,
            token_program: spl_token_2022::ID,
        }
    }

    pub fn fund(&mut self, pubkey: &Pubkey, lamports: u64) {
        self.svm.airdrop(pubkey, lamports).unwrap();
    }

    pub fn advance_time(&mut self, seconds: i64) {
        let mut clock = self.svm.get_sysvar::<solana_clock::Clock>();
        clock.unix_timestamp = clock.unix_timestamp.saturating_add(seconds);
        self.svm.set_sysvar::<solana_clock::Clock>(&clock);
        self.svm.expire_blockhash();
    }

    pub fn send(
        &mut self,
        ix: Instruction,
        payer: &Keypair,
        extra: &[&Keypair],
    ) -> litesvm::types::TransactionResult {
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        let result = self.svm.send_transaction(tx);
        self.svm.expire_blockhash();
        result
    }

    pub fn config_pda(&self) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"config"], &self.program_id)
    }

    pub fn auction_pda(&self, seller: &Pubkey, auction_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[
                b"auction",
                seller.as_ref(),
                &auction_id.to_le_bytes(),
            ],
            &self.program_id,
        )
    }

    pub fn vault_pda(&self, auction: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", auction.as_ref()], &self.program_id)
    }

    pub fn bid_pda(&self, auction: &Pubkey, bidder: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"bid", auction.as_ref(), bidder.as_ref()],
            &self.program_id,
        )
    }

    pub fn create_mint(&mut self, authority: &Keypair, decimals: u8) -> Pubkey {
        CreateMint::new(&mut self.svm, authority)
            .token_program_id(&self.token_program)
            .decimals(decimals)
            .authority(&authority.pubkey())
            .send()
            .unwrap()
    }

    pub fn create_ata(&mut self, payer: &Keypair, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        CreateAssociatedTokenAccount::new(&mut self.svm, payer, mint)
            .token_program_id(&self.token_program)
            .owner(owner)
            .send()
            .unwrap()
    }

    pub fn mint_to(&mut self, mint: &Pubkey, dest: &Pubkey, authority: &Keypair, amount: u64) {
        MintTo::new(&mut self.svm, authority, mint, dest, amount)
            .token_program_id(&self.token_program)
            .send()
            .unwrap();
    }

    pub fn balance(&self, ata: &Pubkey) -> u64 {
        use litesvm_token::get_spl_account;
        use spl_token_2022::state::Account as T22Acc;
        get_spl_account::<T22Acc>(&self.svm, ata).unwrap().amount
    }

    pub fn get_auction(&self, auction: &Pubkey) -> Auction {
        use anchor_lang::AccountDeserialize;
        let acc = self.svm.get_account(auction).unwrap();
        Auction::try_deserialize(&mut &acc.data[..]).unwrap()
    }

    pub fn get_config(&self, config: &Pubkey) -> AuctionConfig {
        use anchor_lang::AccountDeserialize;
        let acc = self.svm.get_account(config).unwrap();
        AuctionConfig::try_deserialize(&mut &acc.data[..]).unwrap()
    }

    pub fn get_bid(&self, bid: &Pubkey) -> SealedBid {
        use anchor_lang::AccountDeserialize;
        let acc = self.svm.get_account(bid).unwrap();
        SealedBid::try_deserialize(&mut &acc.data[..]).unwrap()
    }
}

pub fn initialize_auction_config_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    payment_mint: &Pubkey,
    treasury: &Pubkey,
    fee_bps: u16,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: auctions::accounts::InitializeAuctionConfig {
            authority: *authority,
            config: *config,
            payment_mint: *payment_mint,
            treasury: *treasury,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: auctions::instruction::InitializeAuctionConfig { fee_bps }.data(),
    }
}

pub fn create_auction_ix(
    program_id: &Pubkey,
    seller: &Pubkey,
    auction: &Pubkey,
    payment_mint: &Pubkey,
    vault: &Pubkey,
    payment_token_program: &Pubkey,
    associated_token_program: &Pubkey,
    system_program: &Pubkey,
    auction_id: u64,
    start_price: u64,
    min_deposit: u64,
    commit_ends_at: i64,
    reveal_ends_at: i64,
    memo: String,
    metadata_uri: String,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: auctions::accounts::CreateAuction {
            seller: *seller,
            auction: *auction,
            payment_mint: *payment_mint,
            vault: *vault,
            payment_token_program: *payment_token_program,
            associated_token_program: *associated_token_program,
            system_program: *system_program,
        }
        .to_account_metas(None),
        data: auctions::instruction::CreateAuction {
            auction_id,
            start_price,
            min_deposit,
            commit_ends_at,
            reveal_ends_at,
            memo,
            metadata_uri,
        }
        .data(),
    }
}

pub fn cancel_auction_ix(
    program_id: &Pubkey,
    seller: &Pubkey,
    auction: &Pubkey,
    vault: &Pubkey,
    payment_token_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: auctions::accounts::CancelAuction {
            seller: *seller,
            auction: *auction,
            vault: *vault,
            payment_token_program: *payment_token_program,
        }
        .to_account_metas(None),
        data: auctions::instruction::CancelAuction {}.data(),
    }
}

pub fn commit_bid_ix(
    program_id: &Pubkey,
    bidder: &Pubkey,
    auction: &Pubkey,
    bid: &Pubkey,
    payment_mint: &Pubkey,
    bidder_payment_account: &Pubkey,
    vault: &Pubkey,
    payment_token_program: &Pubkey,
    system_program: &Pubkey,
    commit: [u8; 32],
    escrow: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: auctions::accounts::CommitBid {
            bidder: *bidder,
            auction: *auction,
            bid: *bid,
            payment_mint: *payment_mint,
            bidder_payment_account: *bidder_payment_account,
            vault: *vault,
            payment_token_program: *payment_token_program,
            system_program: *system_program,
        }
        .to_account_metas(None),
        data: auctions::instruction::CommitBid { commit, escrow }.data(),
    }
}

pub fn reveal_bid_ix(
    program_id: &Pubkey,
    bidder: &Pubkey,
    auction: &Pubkey,
    bid: &Pubkey,
    bid_amount: u64,
    nonce: [u8; 32],
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: auctions::accounts::RevealBid {
            bidder: *bidder,
            auction: *auction,
            bid: *bid,
        }
        .to_account_metas(None),
        data: auctions::instruction::RevealBid {
            bid_amount,
            nonce,
        }
        .data(),
    }
}

pub fn settle_auction_ix(
    program_id: &Pubkey,
    caller: &Pubkey,
    auction: &Pubkey,
    winner_bid: &Pubkey,
    config: &Pubkey,
    payment_mint: &Pubkey,
    vault: &Pubkey,
    seller_payment_account: &Pubkey,
    seller: &Pubkey,
    treasury: &Pubkey,
    payment_token_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: auctions::accounts::SettleAuction {
            caller: *caller,
            auction: *auction,
            winner_bid: *winner_bid,
            config: *config,
            payment_mint: *payment_mint,
            vault: *vault,
            seller_payment_account: *seller_payment_account,
            seller: *seller,
            treasury: *treasury,
            payment_token_program: *payment_token_program,
        }
        .to_account_metas(None),
        data: auctions::instruction::SettleAuction {}.data(),
    }
}

pub fn refund_bid_ix(
    program_id: &Pubkey,
    bidder: &Pubkey,
    auction: &Pubkey,
    bid: &Pubkey,
    payment_mint: &Pubkey,
    vault: &Pubkey,
    bidder_payment_account: &Pubkey,
    payment_token_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: auctions::accounts::RefundBid {
            bidder: *bidder,
            auction: *auction,
            bid: *bid,
            payment_mint: *payment_mint,
            vault: *vault,
            bidder_payment_account: *bidder_payment_account,
            payment_token_program: *payment_token_program,
        }
        .to_account_metas(None),
        data: auctions::instruction::RefundBid {}.data(),
    }
}

/// Keccak256(le_bytes(bid_amount) || nonce) — must match on-chain `reveal_bid`.
pub fn bid_commit_hash(bid_amount: u64, nonce: &[u8; 32]) -> [u8; 32] {
    use sha3::{Digest, Keccak256};
    let mut h = Keccak256::new();
    h.update(bid_amount.to_le_bytes());
    h.update(nonce);
    h.finalize().into()
}
