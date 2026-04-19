#![allow(dead_code)]

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    litesvm_token::{spl_token, CreateAssociatedTokenAccount, CreateMint, MintTo},
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const USDC_DECIMALS: u8 = 6;
pub const USDC_UNIT: u64 = 1_000_000;
pub const HOUR: i64 = 3_600;
pub const DAY: i64 = 86_400;

pub struct TestCtx {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    pub token_program: Pubkey,
    current_timestamp: i64,
}

impl TestCtx {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let program_id = events::id();

        let bytes = include_bytes!("../../../../target/deploy/events.so");
        svm.add_program(program_id, bytes).unwrap();

        let start_ts = 1_735_689_600i64;
        let mut clock = svm.get_sysvar::<Clock>();
        clock.unix_timestamp = start_ts;
        svm.set_sysvar::<Clock>(&clock);

        Self {
            svm,
            program_id,
            token_program: spl_token::ID,
            current_timestamp: start_ts,
        }
    }

    pub fn now(&self) -> i64 {
        self.current_timestamp
    }

    pub fn advance_time(&mut self, seconds: i64) {
        self.current_timestamp += seconds;
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = self.current_timestamp;
        self.svm.set_sysvar::<Clock>(&clock);
        self.svm.expire_blockhash();
    }

    pub fn fund(&mut self, pubkey: &Pubkey, lamports: u64) {
        self.svm.airdrop(pubkey, lamports).unwrap();
    }

    pub fn send(
        &mut self,
        ix: Instruction,
        payer: &Keypair,
        extra_signers: &[&Keypair],
    ) -> litesvm::types::TransactionResult {
        // Rotate the blockhash on every send so that repeating the same
        // instruction payload (e.g. pause → resume → retry-buy) does not
        // hit AlreadyProcessed.
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra_signers);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        self.svm.send_transaction(tx)
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

    pub fn ticket_pda(&self, event: &Pubkey, attendee: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"ticket", event.as_ref(), attendee.as_ref()],
            &self.program_id,
        )
    }

    pub fn create_usdc_mint(&mut self, authority: &Keypair) -> Pubkey {
        CreateMint::new(&mut self.svm, authority)
            .token_program_id(&self.token_program)
            .decimals(USDC_DECIMALS)
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

    pub fn mint_usdc_to(&mut self, mint: &Pubkey, destination: &Pubkey, authority: &Keypair, amount: u64) {
        MintTo::new(&mut self.svm, authority, mint, destination, amount)
            .token_program_id(&self.token_program)
            .send()
            .unwrap();
    }

    pub fn token_balance(&self, ata: &Pubkey) -> u64 {
        use litesvm_token::{get_spl_account, spl_token::state::Account};
        get_spl_account::<Account>(&self.svm, ata).unwrap().amount
    }

    pub fn get_event(&self, event: &Pubkey) -> events::state::Event {
        use anchor_lang::AccountDeserialize;
        let account = self.svm.get_account(event).unwrap();
        events::state::Event::try_deserialize(&mut &account.data[..]).unwrap()
    }

    pub fn get_ticket(&self, ticket: &Pubkey) -> events::state::Ticket {
        use anchor_lang::AccountDeserialize;
        let account = self.svm.get_account(ticket).unwrap();
        events::state::Ticket::try_deserialize(&mut &account.data[..]).unwrap()
    }
}

pub fn create_event_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    mint: &Pubkey,
    event: &Pubkey,
    vault: &Pubkey,
    token_program: &Pubkey,
    event_id: u64,
    price: u64,
    capacity: u64,
    starts_at: i64,
    ends_at: i64,
    metadata_uri: String,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: events::accounts::CreateEvent {
            creator: *creator,
            mint: *mint,
            event: *event,
            vault: *vault,
            token_program: *token_program,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: events::instruction::CreateEvent {
            event_id,
            price,
            capacity,
            starts_at,
            ends_at,
            metadata_uri,
        }
        .data(),
    }
}

pub fn buy_ticket_ix(
    program_id: &Pubkey,
    attendee: &Pubkey,
    attendee_token_account: &Pubkey,
    event: &Pubkey,
    vault: &Pubkey,
    ticket: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: events::accounts::BuyTicket {
            attendee: *attendee,
            attendee_token_account: *attendee_token_account,
            event: *event,
            vault: *vault,
            ticket: *ticket,
            mint: *mint,
            token_program: *token_program,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: events::instruction::BuyTicket {}.data(),
    }
}

pub fn check_in_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    ticket: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: events::accounts::CheckIn {
            creator: *creator,
            event: *event,
            ticket: *ticket,
        }
        .to_account_metas(None),
        data: events::instruction::CheckIn {}.data(),
    }
}

pub fn withdraw_revenue_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    event: &Pubkey,
    vault: &Pubkey,
    destination: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    amount: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: events::accounts::WithdrawRevenue {
            creator: *creator,
            event: *event,
            vault: *vault,
            destination: *destination,
            mint: *mint,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: events::instruction::WithdrawRevenue { amount }.data(),
    }
}

/// Creator + event fixture. By default creates a $5 event with
/// unlimited capacity starting now, ending in 7 days.
pub struct EventFixture {
    pub ctx: TestCtx,
    pub mint_authority: Keypair,
    pub mint: Pubkey,
    pub creator: Keypair,
    pub event_id: u64,
    pub price: u64,
    pub event: Pubkey,
    pub vault: Pubkey,
}

impl EventFixture {
    pub fn new(price: u64, capacity: u64) -> Self {
        Self::new_with_window(price, capacity, 0, DAY * 7)
    }

    pub fn new_with_window(
        price: u64,
        capacity: u64,
        starts_offset: i64,
        duration: i64,
    ) -> Self {
        let mut ctx = TestCtx::new();

        let mint_authority = Keypair::new();
        ctx.fund(&mint_authority.pubkey(), 5_000_000_000);
        let mint = ctx.create_usdc_mint(&mint_authority);

        let creator = Keypair::new();
        ctx.fund(&creator.pubkey(), 5_000_000_000);

        let event_id = 7u64;
        let now = ctx.now();
        let starts_at = now + starts_offset;
        let ends_at = starts_at + duration;

        let (event, _) = ctx.event_pda(&creator.pubkey(), event_id);
        let (vault, _) = ctx.vault_pda(&event);

        let ix = create_event_ix(
            &ctx.program_id,
            &creator.pubkey(),
            &mint,
            &event,
            &vault,
            &ctx.token_program,
            event_id,
            price,
            capacity,
            starts_at,
            ends_at,
            "ipfs://demo".to_string(),
        );
        ctx.send(ix, &creator, &[]).unwrap();

        Self {
            ctx,
            mint_authority,
            mint,
            creator,
            event_id,
            price,
            event,
            vault,
        }
    }

    pub fn new_attendee(&mut self, starting_usdc: u64) -> (Keypair, Pubkey, Pubkey) {
        let attendee = Keypair::new();
        self.ctx.fund(&attendee.pubkey(), 5_000_000_000);
        let attendee_ata = self.ctx.create_ata(&attendee, &attendee.pubkey(), &self.mint);
        if starting_usdc > 0 {
            self.ctx
                .mint_usdc_to(&self.mint, &attendee_ata, &self.mint_authority, starting_usdc);
        }
        let (ticket_pda, _) = self.ctx.ticket_pda(&self.event, &attendee.pubkey());
        (attendee, attendee_ata, ticket_pda)
    }

    pub fn buy(
        &mut self,
        attendee: &Keypair,
        attendee_ata: &Pubkey,
        ticket: &Pubkey,
    ) -> litesvm::types::TransactionResult {
        let ix = buy_ticket_ix(
            &self.ctx.program_id,
            &attendee.pubkey(),
            attendee_ata,
            &self.event,
            &self.vault,
            ticket,
            &self.mint,
            &self.ctx.token_program,
        );
        self.ctx.send(ix, attendee, &[])
    }
}
