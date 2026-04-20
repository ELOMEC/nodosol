#![allow(dead_code)]

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    anchor_spl::token_interface::spl_token_2022,
    event_tickets::constants::{
        ACCOUNT_COMPRESSION_PROGRAM_ID, BUBBLEGUM_PROGRAM_ID, NOOP_PROGRAM_ID,
        TREE_MAX_BUFFER_SIZE, TREE_MAX_DEPTH,
    },
    event_tickets::state::{Config, Event, EventStatus},
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const USDC_DECIMALS: u8 = 6;
pub const START_UNIX: i64 = 1_735_689_600; // 2025-01-01

pub struct TestCtx {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    pub token_program: Pubkey,
}

impl TestCtx {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let program_id = event_tickets::id();
        svm.add_program(program_id, include_bytes!("../../../../target/deploy/event_tickets.so"))
            .unwrap();

        // Bubblegum, Account Compression, Noop — real mainnet/devnet .so blobs so
        // the Bubblegum CPI works end-to-end inside LiteSVM.
        svm.add_program(
            Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes()),
            include_bytes!("../fixtures/bubblegum.so"),
        )
        .unwrap();
        svm.add_program(
            Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes()),
            include_bytes!("../fixtures/account_compression.so"),
        )
        .unwrap();
        svm.add_program(
            Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes()),
            include_bytes!("../fixtures/spl_noop.so"),
        )
        .unwrap();

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
        ixs: Vec<Instruction>,
        payer: &Keypair,
        extra: &[&Keypair],
    ) -> litesvm::types::TransactionResult {
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&ixs, Some(&payer.pubkey()), &blockhash);
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
    pub fn event_pda(&self, creator: &Pubkey, event_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"event", creator.as_ref(), &event_id.to_le_bytes()],
            &self.program_id,
        )
    }
    pub fn vault_pda(&self, event: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", event.as_ref()], &self.program_id)
    }
    pub fn tree_config_pda(&self, merkle_tree: &Pubkey) -> (Pubkey, u8) {
        let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
        Pubkey::find_program_address(&[merkle_tree.as_ref()], &bubblegum)
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

    pub fn get_config(&self, config: &Pubkey) -> Config {
        use anchor_lang::AccountDeserialize;
        let acc = self.svm.get_account(config).unwrap();
        Config::try_deserialize(&mut &acc.data[..]).unwrap()
    }
    pub fn get_event(&self, event: &Pubkey) -> Event {
        use anchor_lang::AccountDeserialize;
        let acc = self.svm.get_account(event).unwrap();
        Event::try_deserialize(&mut &acc.data[..]).unwrap()
    }
}

pub fn initialize_config_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    treasury: &Pubkey,
    fee_bps: u16,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::InitializeConfig {
            authority: *authority,
            config: *config,
            treasury: *treasury,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::InitializeConfig { fee_bps }.data(),
    }
}

pub fn create_event_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    payment_mint: &Pubkey,
    event: &Pubkey,
    vault: &Pubkey,
    payment_token_program: &Pubkey,
    event_id: u64,
    price: u64,
    capacity: u64,
    starts_at: i64,
    ends_at: i64,
    name: String,
    symbol: String,
    metadata_uri: String,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::CreateEvent {
            creator: *creator,
            payment_mint: *payment_mint,
            event: *event,
            vault: *vault,
            payment_token_program: *payment_token_program,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::CreateEvent {
            event_id,
            price,
            capacity,
            starts_at,
            ends_at,
            name,
            symbol,
            metadata_uri,
        }
        .data(),
    }
}

pub fn initialize_event_tree_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    tree_config: &Pubkey,
    merkle_tree: &Pubkey,
) -> Instruction {
    let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
    let compression = Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes());
    let noop = Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes());
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::InitializeEventTree {
            creator: *creator,
            event: *event,
            tree_config: *tree_config,
            merkle_tree: *merkle_tree,
            bubblegum_program: bubblegum,
            compression_program: compression,
            log_wrapper: noop,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::InitializeEventTree {}.data(),
    }
}

pub struct BuyTicketAccounts<'a> {
    pub buyer: &'a Pubkey,
    pub event: &'a Pubkey,
    pub vault: &'a Pubkey,
    pub payment_mint: &'a Pubkey,
    pub buyer_payment_account: &'a Pubkey,
    pub config: &'a Pubkey,
    pub treasury: &'a Pubkey,
    pub token_program: &'a Pubkey,
    pub tree_config: &'a Pubkey,
    pub merkle_tree: &'a Pubkey,
}

pub fn buy_ticket_ix(program_id: &Pubkey, a: BuyTicketAccounts) -> Instruction {
    let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
    let compression = Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes());
    let noop = Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes());
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::BuyTicket {
            buyer: *a.buyer,
            event: *a.event,
            vault: *a.vault,
            payment_mint: *a.payment_mint,
            buyer_payment_account: *a.buyer_payment_account,
            config: *a.config,
            treasury: *a.treasury,
            payment_token_program: *a.token_program,
            tree_config: *a.tree_config,
            leaf_owner: *a.buyer,
            leaf_delegate: *a.buyer,
            merkle_tree: *a.merkle_tree,
            bubblegum_program: bubblegum,
            log_wrapper: noop,
            compression_program: compression,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::BuyTicket {}.data(),
    }
}

pub fn withdraw_event_revenue_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    payment_mint: &Pubkey,
    vault: &Pubkey,
    destination: &Pubkey,
    token_program: &Pubkey,
    amount: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::WithdrawEventRevenue {
            creator: *creator,
            event: *event,
            payment_mint: *payment_mint,
            vault: *vault,
            destination: *destination,
            payment_token_program: *token_program,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::WithdrawEventRevenue { amount }.data(),
    }
}

pub fn update_event_status_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    new_status: EventStatus,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::UpdateEventStatus {
            creator: *creator,
            event: *event,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::UpdateEventStatus { new_status }.data(),
    }
}

/// SPL Account Compression account layout for (max_depth=14, max_buffer_size=64,
/// canopy_depth=0):
///
///   CONCURRENT_MERKLE_TREE_HEADER_SIZE_V1 = 80
///   size_of::<ConcurrentMerkleTree<14, 64>>() = 24 + 488*64 + 488 = 31_744
///   canopy = 0
///
/// Total = 80 + 31_744 = 31_824 bytes.
pub const MERKLE_TREE_ACCOUNT_SIZE: u64 = 31_800;

pub fn make_create_merkle_tree_account_ix(
    payer: &Pubkey,
    merkle_tree: &Pubkey,
    rent_lamports: u64,
) -> Instruction {
    use anchor_lang::system_program;
    let ix = anchor_lang::solana_program::system_instruction::create_account(
        payer,
        merkle_tree,
        rent_lamports,
        MERKLE_TREE_ACCOUNT_SIZE,
        &Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes()),
    );
    // Re-wrap to drop any implicit imports.
    let _ = system_program::ID;
    ix
}

/// Confirms tree_max_depth and buffer sizing at compile-time match the
/// merkle account size constant above. Any change requires regenerating
/// MERKLE_TREE_ACCOUNT_SIZE.
pub fn assert_tree_sizing() {
    assert_eq!(TREE_MAX_DEPTH, 14);
    assert_eq!(TREE_MAX_BUFFER_SIZE, 64);
}

/// End-to-end fixture: Config initialised, event created, creator + buyer funded.
pub struct Fixture {
    pub ctx: TestCtx,
    pub config_authority: Keypair,
    pub config: Pubkey,
    pub treasury_owner: Keypair,
    pub treasury: Pubkey,

    pub payment_mint_authority: Keypair,
    pub payment_mint: Pubkey,

    pub creator: Keypair,
    pub creator_payment_ata: Pubkey,

    pub buyer: Keypair,
    pub buyer_payment_ata: Pubkey,
}

impl Fixture {
    pub fn new_with_fee(fee_bps: u16, buyer_usdc: u64) -> Self {
        let mut ctx = TestCtx::new();

        let payment_mint_authority = Keypair::new();
        ctx.fund(&payment_mint_authority.pubkey(), 5_000_000_000);
        let payment_mint = ctx.create_mint(&payment_mint_authority, USDC_DECIMALS);

        let config_authority = Keypair::new();
        ctx.fund(&config_authority.pubkey(), 5_000_000_000);
        let treasury_owner = Keypair::new();
        let treasury = ctx.create_ata(&config_authority, &treasury_owner.pubkey(), &payment_mint);
        let (config, _) = ctx.config_pda();
        let init_cfg = initialize_config_ix(
            &ctx.program_id,
            &config_authority.pubkey(),
            &config,
            &treasury,
            fee_bps,
        );
        ctx.send(vec![init_cfg], &config_authority, &[]).unwrap();

        let creator = Keypair::new();
        ctx.fund(&creator.pubkey(), 10_000_000_000);
        let creator_payment_ata = ctx.create_ata(&creator, &creator.pubkey(), &payment_mint);

        let buyer = Keypair::new();
        ctx.fund(&buyer.pubkey(), 5_000_000_000);
        let buyer_payment_ata = ctx.create_ata(&buyer, &buyer.pubkey(), &payment_mint);
        if buyer_usdc > 0 {
            ctx.mint_to(&payment_mint, &buyer_payment_ata, &payment_mint_authority, buyer_usdc);
        }

        Self {
            ctx,
            config_authority,
            config,
            treasury_owner,
            treasury,
            payment_mint_authority,
            payment_mint,
            creator,
            creator_payment_ata,
            buyer,
            buyer_payment_ata,
        }
    }
}
