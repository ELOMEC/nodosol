#![allow(dead_code)]

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    anchor_spl::token_interface::spl_token_2022,
    event_tickets::constants::{
        ACCOUNT_COMPRESSION_PROGRAM_ID, BUBBLEGUM_PROGRAM_ID, NOOP_PROGRAM_ID,
        TREE_MAX_BUFFER_SIZE, TREE_MAX_DEPTH,
    },
    event_tickets::state::{Config, Event, EventStatus, TicketTier, TierStatus},
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
    pub fn tier_pda(&self, event: &Pubkey, tier_id: u16) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"tier", event.as_ref(), &tier_id.to_le_bytes()],
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
    pub fn get_tier(&self, tier: &Pubkey) -> TicketTier {
        use anchor_lang::AccountDeserialize;
        let acc = self.svm.get_account(tier).unwrap();
        TicketTier::try_deserialize(&mut &acc.data[..]).unwrap()
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

// === Tier helpers (Phase 3 P2-008) ===

#[allow(clippy::too_many_arguments)]
pub fn create_tier_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    tier: &Pubkey,
    tier_id: u16,
    name: String,
    section_code: String,
    price: u64,
    capacity: u32,
    color_hex: [u8; 6],
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::CreateTier {
            creator: *creator,
            event: *event,
            tier: *tier,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::CreateTier {
            tier_id,
            name,
            section_code,
            price,
            capacity,
            color_hex,
        }
        .data(),
    }
}

pub struct BuyTierTicketAccounts<'a> {
    pub buyer: &'a Pubkey,
    pub event: &'a Pubkey,
    pub tier: &'a Pubkey,
    pub vault: &'a Pubkey,
    pub payment_mint: &'a Pubkey,
    pub buyer_payment_account: &'a Pubkey,
    pub config: &'a Pubkey,
    pub treasury: &'a Pubkey,
    pub token_program: &'a Pubkey,
    pub tree_config: &'a Pubkey,
    pub merkle_tree: &'a Pubkey,
}

pub fn buy_tier_ticket_ix(
    program_id: &Pubkey,
    a: BuyTierTicketAccounts,
    row_label: String,
    seat_number: u16,
) -> Instruction {
    let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
    let compression = Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes());
    let noop = Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes());
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::BuyTierTicket {
            buyer: *a.buyer,
            event: *a.event,
            tier: *a.tier,
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
        data: event_tickets::instruction::BuyTierTicket {
            row_label,
            seat_number,
        }
        .data(),
    }
}

pub fn update_tier_status_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    tier: &Pubkey,
    new_status: TierStatus,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::UpdateTierStatus {
            creator: *creator,
            event: *event,
            tier: *tier,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::UpdateTierStatus { new_status }.data(),
    }
}

pub fn update_tier_capacity_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    tier: &Pubkey,
    new_capacity: u32,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::UpdateTierCapacity {
            creator: *creator,
            event: *event,
            tier: *tier,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::UpdateTierCapacity { new_capacity }.data(),
    }
}

pub fn update_tier_price_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    tier: &Pubkey,
    new_price: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::UpdateTierPrice {
            creator: *creator,
            event: *event,
            tier: *tier,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::UpdateTierPrice { new_price }.data(),
    }
}

// === Admin (config_authority) helpers ===

pub fn update_pause_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    paused: bool,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::UpdatePause {
            authority: *authority,
            config: *config,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::UpdatePause { paused }.data(),
    }
}

pub fn update_fee_bps_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    new_fee_bps: u16,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::UpdateFeeBps {
            authority: *authority,
            config: *config,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::UpdateFeeBps { new_fee_bps }.data(),
    }
}

pub fn update_treasury_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    new_treasury: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::UpdateTreasury {
            authority: *authority,
            config: *config,
            new_treasury: *new_treasury,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::UpdateTreasury {}.data(),
    }
}

pub fn update_config_authority_ix(
    program_id: &Pubkey,
    authority: &Pubkey,
    config: &Pubkey,
    new_authority: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: event_tickets::accounts::UpdateConfigAuthority {
            authority: *authority,
            config: *config,
            new_authority: *new_authority,
        }
        .to_account_metas(None),
        data: event_tickets::instruction::UpdateConfigAuthority {}.data(),
    }
}

// === Resale helpers (Phase 3 P2-008) ===
//
// Off-chain mirror of the on-chain Bubblegum tree, modelled on the
// TreeManager pattern from mpl-bubblegum's own tests. After every
// successful on-chain mint we mirror the same MetadataArgs into the
// local merkle reference; that lets us compute the (root, data_hash,
// creator_hash, nonce) inputs and the merkle proof remaining-accounts
// list that list_ticket_resale / buy_ticket_resale / cancel /
// close_expired_resale all need.

use {
    anchor_lang::solana_program::instruction::AccountMeta,
    mpl_bubblegum::{
        hash::{hash_creators, hash_metadata},
        types::{LeafSchema, MetadataArgs, TokenProgramVersion, TokenStandard},
        utils::get_asset_id,
    },
    spl_merkle_tree_reference::{MerkleTree, EMPTY},
};

pub struct TreeMirror {
    tree: MerkleTree,
    leaves: Vec<LeafSchema>,
}

impl TreeMirror {
    pub fn new() -> Self {
        // Match the on-chain tree shape: max_depth=14, max_buffer_size=64
        // (see event_tickets::constants::TREE_MAX_*). The reference impl
        // initialises with all-zero leaves — same as a fresh on-chain tree.
        let leaves = vec![EMPTY; 1usize << TREE_MAX_DEPTH];
        Self {
            tree: MerkleTree::new(leaves.as_slice()),
            leaves: Vec::new(),
        }
    }

    pub fn current_index(&self) -> u32 {
        self.leaves.len() as u32
    }

    pub fn root(&self) -> [u8; 32] {
        self.tree.get_root()
    }

    /// Mirror a successful on-chain mint. The args MUST match what
    /// the on-chain `buy_ticket` / `buy_tier_ticket` call computed —
    /// identical name + symbol + uri. We reconstruct MetadataArgs the
    /// same way the program does (via `build_metadata_args` semantics).
    pub fn mirror_mint_primary_sale(
        &mut self,
        merkle_tree_pk: &Pubkey,
        owner: Pubkey,
        name: &str,
        symbol: &str,
        uri: &str,
    ) -> LeafSchema {
        let nonce = self.leaves.len() as u64;
        let args = primary_sale_metadata(name, symbol, uri);
        let data_hash = hash_metadata(&args).unwrap();
        let creator_hash = hash_creators(&args.creators);
        let asset_id = get_asset_id(merkle_tree_pk, nonce);
        let leaf = LeafSchema::V1 {
            id: asset_id,
            owner,
            delegate: owner,
            nonce,
            data_hash,
            creator_hash,
        };
        self.tree.add_leaf(leaf.hash(), nonce as usize);
        self.leaves.push(leaf.clone());
        leaf
    }

    pub fn proof_metas(&self, index: u32) -> Vec<AccountMeta> {
        self.tree
            .get_proof_of_leaf(index as usize)
            .into_iter()
            .map(|node| AccountMeta::new_readonly(Pubkey::new_from_array(node), false))
            .collect()
    }

    pub fn leaf(&self, index: u32) -> &LeafSchema {
        &self.leaves[index as usize]
    }

    /// Mirror a successful on-chain transfer (e.g. list_ticket_resale or
    /// the inverse on cancel/buy_resale/close_expired). Replaces the
    /// stored leaf at `index` with a copy whose owner+delegate reflect
    /// the new holder.
    pub fn mirror_transfer(&mut self, index: u32, new_owner: Pubkey) {
        let prev = self.leaves[index as usize].clone();
        let updated = match prev {
            LeafSchema::V1 {
                id,
                nonce,
                data_hash,
                creator_hash,
                ..
            } => LeafSchema::V1 {
                id,
                owner: new_owner,
                delegate: new_owner,
                nonce,
                data_hash,
                creator_hash,
            },
            other => other,
        };
        self.tree.add_leaf(updated.hash(), index as usize);
        self.leaves[index as usize] = updated;
    }
}

/// MetadataArgs used by `buy_ticket` / `buy_tier_ticket` — must mirror
/// `build_metadata_args` in the program source.
fn primary_sale_metadata(name: &str, symbol: &str, uri: &str) -> MetadataArgs {
    MetadataArgs {
        name: name.to_string(),
        symbol: symbol.to_string(),
        uri: uri.to_string(),
        seller_fee_basis_points: 0,
        primary_sale_happened: true,
        is_mutable: false,
        edition_nonce: None,
        token_standard: Some(TokenStandard::NonFungible),
        collection: None,
        uses: None,
        token_program_version: TokenProgramVersion::Original,
        creators: vec![],
    }
}

pub fn resale_pda(merkle_tree: &Pubkey, leaf_index: u32, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"resale", merkle_tree.as_ref(), &leaf_index.to_le_bytes()],
        program_id,
    )
}

pub struct BuyTicketResaleAccounts<'a> {
    pub buyer: &'a Pubkey,
    pub seller: &'a Pubkey,
    pub listing: &'a Pubkey,
    pub payment_mint: &'a Pubkey,
    pub buyer_payment_account: &'a Pubkey,
    pub seller_payment_account: &'a Pubkey,
    pub config: &'a Pubkey,
    pub treasury: &'a Pubkey,
    pub token_program: &'a Pubkey,
    pub tree_config: &'a Pubkey,
    pub merkle_tree: &'a Pubkey,
}

#[allow(clippy::too_many_arguments)]
pub fn buy_ticket_resale_ix(
    program_id: &Pubkey,
    a: BuyTicketResaleAccounts,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    proof_metas: &[AccountMeta],
) -> Instruction {
    let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
    let compression = Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes());
    let noop = Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes());

    let mut accounts = event_tickets::accounts::BuyTicketResale {
        buyer: *a.buyer,
        seller: *a.seller,
        listing: *a.listing,
        payment_mint: *a.payment_mint,
        buyer_payment_account: *a.buyer_payment_account,
        seller_payment_account: *a.seller_payment_account,
        config: *a.config,
        treasury: *a.treasury,
        payment_token_program: *a.token_program,
        tree_config: *a.tree_config,
        merkle_tree: *a.merkle_tree,
        bubblegum_program: bubblegum,
        log_wrapper: noop,
        compression_program: compression,
        system_program: anchor_lang::system_program::ID,
    }
    .to_account_metas(None);
    accounts.extend_from_slice(proof_metas);

    Instruction {
        program_id: *program_id,
        accounts,
        data: event_tickets::instruction::BuyTicketResale {
            root,
            data_hash,
            creator_hash,
        }
        .data(),
    }
}

pub struct ListTicketResaleAccounts<'a> {
    pub seller: &'a Pubkey,
    pub event: &'a Pubkey,
    pub listing: &'a Pubkey,
    pub tree_config: &'a Pubkey,
    pub merkle_tree: &'a Pubkey,
}

// === Private resale helpers (commit/reveal pricing) ===

/// Mirror the on-chain `keccak256(price_le_bytes || nonce)` commit
/// scheme used by `buy_ticket_resale_private.rs`. Clients producing a
/// commit MUST use keccak (not sha256) — otherwise reveal will fail.
pub fn private_price_commit(price: u64, nonce: &[u8; 32]) -> [u8; 32] {
    use solana_program::keccak;
    keccak::hashv(&[&price.to_le_bytes(), nonce]).to_bytes()
}

#[allow(clippy::too_many_arguments)]
pub fn list_ticket_resale_private_ix(
    program_id: &Pubkey,
    a: ListTicketResaleAccounts,
    leaf_index: u32,
    nonce: u64,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    price_commit: [u8; 32],
    expires_at: i64,
    proof_metas: &[AccountMeta],
) -> Instruction {
    let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
    let compression = Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes());
    let noop = Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes());

    let mut accounts = event_tickets::accounts::ListTicketResalePrivate {
        seller: *a.seller,
        event: *a.event,
        listing: *a.listing,
        tree_config: *a.tree_config,
        merkle_tree: *a.merkle_tree,
        bubblegum_program: bubblegum,
        log_wrapper: noop,
        compression_program: compression,
        system_program: anchor_lang::system_program::ID,
    }
    .to_account_metas(None);
    accounts.extend_from_slice(proof_metas);

    Instruction {
        program_id: *program_id,
        accounts,
        data: event_tickets::instruction::ListTicketResalePrivate {
            leaf_index,
            nonce,
            root,
            data_hash,
            creator_hash,
            price_commit,
            expires_at,
        }
        .data(),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn buy_ticket_resale_private_ix(
    program_id: &Pubkey,
    a: BuyTicketResaleAccounts,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    revealed_price: u64,
    price_nonce: [u8; 32],
    proof_metas: &[AccountMeta],
) -> Instruction {
    let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
    let compression = Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes());
    let noop = Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes());

    let mut accounts = event_tickets::accounts::BuyTicketResalePrivate {
        buyer: *a.buyer,
        seller: *a.seller,
        listing: *a.listing,
        payment_mint: *a.payment_mint,
        buyer_payment_account: *a.buyer_payment_account,
        seller_payment_account: *a.seller_payment_account,
        config: *a.config,
        treasury: *a.treasury,
        payment_token_program: *a.token_program,
        tree_config: *a.tree_config,
        merkle_tree: *a.merkle_tree,
        bubblegum_program: bubblegum,
        log_wrapper: noop,
        compression_program: compression,
        system_program: anchor_lang::system_program::ID,
    }
    .to_account_metas(None);
    accounts.extend_from_slice(proof_metas);

    Instruction {
        program_id: *program_id,
        accounts,
        data: event_tickets::instruction::BuyTicketResalePrivate {
            root,
            data_hash,
            creator_hash,
            revealed_price,
            price_nonce,
        }
        .data(),
    }
}

pub struct CancelTicketResaleAccounts<'a> {
    pub seller: &'a Pubkey,
    pub listing: &'a Pubkey,
    pub tree_config: &'a Pubkey,
    pub merkle_tree: &'a Pubkey,
}

pub fn cancel_ticket_resale_ix(
    program_id: &Pubkey,
    a: CancelTicketResaleAccounts,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    proof_metas: &[AccountMeta],
) -> Instruction {
    let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
    let compression = Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes());
    let noop = Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes());

    let mut accounts = event_tickets::accounts::CancelTicketResale {
        seller: *a.seller,
        listing: *a.listing,
        tree_config: *a.tree_config,
        merkle_tree: *a.merkle_tree,
        bubblegum_program: bubblegum,
        log_wrapper: noop,
        compression_program: compression,
        system_program: anchor_lang::system_program::ID,
    }
    .to_account_metas(None);
    accounts.extend_from_slice(proof_metas);

    Instruction {
        program_id: *program_id,
        accounts,
        data: event_tickets::instruction::CancelTicketResale {
            root,
            data_hash,
            creator_hash,
        }
        .data(),
    }
}

pub struct CloseExpiredResaleAccounts<'a> {
    pub caller: &'a Pubkey,
    pub seller: &'a Pubkey,
    pub listing: &'a Pubkey,
    pub tree_config: &'a Pubkey,
    pub merkle_tree: &'a Pubkey,
}

pub fn close_expired_resale_ix(
    program_id: &Pubkey,
    a: CloseExpiredResaleAccounts,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    proof_metas: &[AccountMeta],
) -> Instruction {
    let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
    let compression = Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes());
    let noop = Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes());

    let mut accounts = event_tickets::accounts::CloseExpiredResale {
        caller: *a.caller,
        seller: *a.seller,
        listing: *a.listing,
        tree_config: *a.tree_config,
        merkle_tree: *a.merkle_tree,
        bubblegum_program: bubblegum,
        log_wrapper: noop,
        compression_program: compression,
        system_program: anchor_lang::system_program::ID,
    }
    .to_account_metas(None);
    accounts.extend_from_slice(proof_metas);

    Instruction {
        program_id: *program_id,
        accounts,
        data: event_tickets::instruction::CloseExpiredResale {
            root,
            data_hash,
            creator_hash,
        }
        .data(),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn list_ticket_resale_ix(
    program_id: &Pubkey,
    a: ListTicketResaleAccounts,
    leaf_index: u32,
    nonce: u64,
    root: [u8; 32],
    data_hash: [u8; 32],
    creator_hash: [u8; 32],
    price: u64,
    expires_at: i64,
    proof_metas: &[AccountMeta],
) -> Instruction {
    let bubblegum = Pubkey::new_from_array(BUBBLEGUM_PROGRAM_ID.to_bytes());
    let compression = Pubkey::new_from_array(ACCOUNT_COMPRESSION_PROGRAM_ID.to_bytes());
    let noop = Pubkey::new_from_array(NOOP_PROGRAM_ID.to_bytes());

    let mut accounts = event_tickets::accounts::ListTicketResale {
        seller: *a.seller,
        event: *a.event,
        listing: *a.listing,
        tree_config: *a.tree_config,
        merkle_tree: *a.merkle_tree,
        bubblegum_program: bubblegum,
        log_wrapper: noop,
        compression_program: compression,
        system_program: anchor_lang::system_program::ID,
    }
    .to_account_metas(None);
    accounts.extend_from_slice(proof_metas);

    Instruction {
        program_id: *program_id,
        accounts,
        data: event_tickets::instruction::ListTicketResale {
            leaf_index,
            nonce,
            root,
            data_hash,
            creator_hash,
            price,
            expires_at,
        }
        .data(),
    }
}
