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
pub const PERIOD_HOUR: i64 = 3_600;
pub const PERIOD_DAY: i64 = 86_400;

pub struct TestCtx {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    pub token_program: Pubkey,
    current_timestamp: i64,
}

impl TestCtx {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let program_id = subscription::id();

        let bytes = include_bytes!("../../../../target/deploy/subscription.so");
        svm.add_program(program_id, bytes).unwrap();

        let start_ts = 1_735_689_600i64; // 2025-01-01 00:00:00 UTC
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
        // instruction with the same accounts (e.g. pause → resume →
        // retry-subscribe in a single test) does not hit AlreadyProcessed.
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra_signers);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        self.svm.send_transaction(tx)
    }

    pub fn plan_pda(&self, creator: &Pubkey, plan_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"plan", creator.as_ref(), &plan_id.to_le_bytes()],
            &self.program_id,
        )
    }

    pub fn vault_pda(&self, plan: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", plan.as_ref()], &self.program_id)
    }

    pub fn subscription_pda(&self, plan: &Pubkey, subscriber: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"subscription", plan.as_ref(), subscriber.as_ref()],
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

    pub fn get_plan(&self, plan: &Pubkey) -> subscription::state::SubscriptionPlan {
        use anchor_lang::AccountDeserialize;
        let account = self.svm.get_account(plan).unwrap();
        subscription::state::SubscriptionPlan::try_deserialize(&mut &account.data[..]).unwrap()
    }

    pub fn get_subscription(&self, sub: &Pubkey) -> subscription::state::Subscription {
        use anchor_lang::AccountDeserialize;
        let account = self.svm.get_account(sub).unwrap();
        subscription::state::Subscription::try_deserialize(&mut &account.data[..]).unwrap()
    }
}

pub fn create_plan_ix(
    program_id: &Pubkey,
    creator: &Pubkey,
    mint: &Pubkey,
    plan: &Pubkey,
    vault: &Pubkey,
    token_program: &Pubkey,
    plan_id: u64,
    price_per_period: u64,
    period_seconds: i64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: subscription::accounts::CreatePlan {
            creator: *creator,
            mint: *mint,
            plan: *plan,
            vault: *vault,
            token_program: *token_program,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: subscription::instruction::CreatePlan {
            plan_id,
            price_per_period,
            period_seconds,
        }
        .data(),
    }
}

pub fn subscribe_ix(
    program_id: &Pubkey,
    subscriber: &Pubkey,
    subscriber_token_account: &Pubkey,
    plan: &Pubkey,
    vault: &Pubkey,
    subscription_account: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    approve_amount: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: subscription::accounts::Subscribe {
            subscriber: *subscriber,
            subscriber_token_account: *subscriber_token_account,
            plan: *plan,
            vault: *vault,
            subscription: *subscription_account,
            mint: *mint,
            token_program: *token_program,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: subscription::instruction::Subscribe { approve_amount }.data(),
    }
}

pub fn cancel_ix(
    program_id: &Pubkey,
    signer: &Pubkey,
    plan: &Pubkey,
    subscription_account: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: subscription::accounts::Cancel {
            signer: *signer,
            plan: *plan,
            subscription: *subscription_account,
        }
        .to_account_metas(None),
        data: subscription::instruction::Cancel {}.data(),
    }
}

pub fn charge_ix(
    program_id: &Pubkey,
    cranker: &Pubkey,
    plan: &Pubkey,
    subscription_account: &Pubkey,
    subscriber_token_account: &Pubkey,
    vault: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: subscription::accounts::Charge {
            cranker: *cranker,
            plan: *plan,
            subscription: *subscription_account,
            subscriber_token_account: *subscriber_token_account,
            vault: *vault,
            mint: *mint,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: subscription::instruction::Charge {}.data(),
    }
}

/// Creates a creator + plan fixture.
pub struct PlanFixture {
    pub ctx: TestCtx,
    pub mint_authority: Keypair,
    pub mint: Pubkey,
    pub creator: Keypair,
    pub plan_id: u64,
    pub price: u64,
    pub period: i64,
    pub plan: Pubkey,
    pub vault: Pubkey,
}

impl PlanFixture {
    pub fn new(price: u64, period: i64) -> Self {
        let mut ctx = TestCtx::new();

        let mint_authority = Keypair::new();
        ctx.fund(&mint_authority.pubkey(), 5_000_000_000);
        let mint = ctx.create_usdc_mint(&mint_authority);

        let creator = Keypair::new();
        ctx.fund(&creator.pubkey(), 5_000_000_000);

        let plan_id: u64 = 1;
        let (plan, _) = ctx.plan_pda(&creator.pubkey(), plan_id);
        let (vault, _) = ctx.vault_pda(&plan);

        let ix = create_plan_ix(
            &ctx.program_id,
            &creator.pubkey(),
            &mint,
            &plan,
            &vault,
            &ctx.token_program,
            plan_id,
            price,
            period,
        );
        ctx.send(ix, &creator, &[]).unwrap();

        Self {
            ctx,
            mint_authority,
            mint,
            creator,
            plan_id,
            price,
            period,
            plan,
            vault,
        }
    }

    pub fn new_subscriber(&mut self, starting_usdc: u64) -> (Keypair, Pubkey, Pubkey) {
        let subscriber = Keypair::new();
        self.ctx.fund(&subscriber.pubkey(), 5_000_000_000);
        let subscriber_ata = self.ctx.create_ata(&subscriber, &subscriber.pubkey(), &self.mint);
        if starting_usdc > 0 {
            self.ctx
                .mint_usdc_to(&self.mint, &subscriber_ata, &self.mint_authority, starting_usdc);
        }
        let (subscription_pda, _) = self.ctx.subscription_pda(&self.plan, &subscriber.pubkey());
        (subscriber, subscriber_ata, subscription_pda)
    }

    pub fn subscribe(
        &mut self,
        subscriber: &Keypair,
        subscriber_ata: &Pubkey,
        subscription_account: &Pubkey,
        approve_amount: u64,
    ) -> litesvm::types::TransactionResult {
        let ix = subscribe_ix(
            &self.ctx.program_id,
            &subscriber.pubkey(),
            subscriber_ata,
            &self.plan,
            &self.vault,
            subscription_account,
            &self.mint,
            &self.ctx.token_program,
            approve_amount,
        );
        self.ctx.send(ix, subscriber, &[])
    }
}
