#![allow(dead_code)]

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    litesvm::LiteSVM,
    litesvm_token::{spl_token, CreateAssociatedTokenAccount, CreateMint, MintTo},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const USDC_DECIMALS: u8 = 6;

pub struct TestCtx {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    pub token_program: Pubkey,
}

impl TestCtx {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let program_id = tip_jar::id();

        let bytes = include_bytes!("../../../../target/deploy/tip_jar.so");
        svm.add_program(program_id, bytes).unwrap();

        let mut clock = svm.get_sysvar::<solana_clock::Clock>();
        clock.unix_timestamp = 1_735_689_600; // 2025-01-01 00:00:00 UTC
        svm.set_sysvar::<solana_clock::Clock>(&clock);

        Self {
            svm,
            program_id,
            token_program: spl_token::ID,
        }
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
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra_signers);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        self.svm.send_transaction(tx)
    }

    pub fn creator_profile_pda(&self, owner: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"creator", owner.as_ref()], &self.program_id)
    }

    pub fn vault_pda(&self, creator_profile: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", creator_profile.as_ref()], &self.program_id)
    }

    pub fn config_pda(&self) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"config"], &self.program_id)
    }

    pub fn get_config(&self, config: &Pubkey) -> tip_jar::state::Config {
        use anchor_lang::AccountDeserialize;
        let account = self.svm.get_account(config).unwrap();
        tip_jar::state::Config::try_deserialize(&mut &account.data[..]).unwrap()
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

    pub fn get_profile(&self, profile: &Pubkey) -> tip_jar::state::CreatorProfile {
        use anchor_lang::AccountDeserialize;
        let account = self.svm.get_account(profile).unwrap();
        tip_jar::state::CreatorProfile::try_deserialize(&mut &account.data[..]).unwrap()
    }
}

pub fn initialize_creator_ix(
    program_id: &Pubkey,
    owner: &Pubkey,
    mint: &Pubkey,
    creator_profile: &Pubkey,
    vault: &Pubkey,
    token_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: tip_jar::accounts::InitializeCreator {
            owner: *owner,
            mint: *mint,
            creator_profile: *creator_profile,
            vault: *vault,
            token_program: *token_program,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: tip_jar::instruction::InitializeCreator {}.data(),
    }
}

pub fn send_tip_ix(
    program_id: &Pubkey,
    tipper: &Pubkey,
    tipper_token_account: &Pubkey,
    creator_profile: &Pubkey,
    vault: &Pubkey,
    config: &Pubkey,
    treasury: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    amount: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: tip_jar::accounts::SendTip {
            tipper: *tipper,
            tipper_token_account: *tipper_token_account,
            creator_profile: *creator_profile,
            vault: *vault,
            config: *config,
            treasury: *treasury,
            mint: *mint,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: tip_jar::instruction::SendTip { amount }.data(),
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
        accounts: tip_jar::accounts::InitializeConfig {
            authority: *authority,
            config: *config,
            treasury: *treasury,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: tip_jar::instruction::InitializeConfig { fee_bps }.data(),
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
        accounts: tip_jar::accounts::UpdateFeeBps {
            authority: *authority,
            config: *config,
        }
        .to_account_metas(None),
        data: tip_jar::instruction::UpdateFeeBps { new_fee_bps }.data(),
    }
}

pub fn withdraw_ix(
    program_id: &Pubkey,
    owner: &Pubkey,
    creator_profile: &Pubkey,
    vault: &Pubkey,
    destination: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    amount: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: tip_jar::accounts::Withdraw {
            owner: *owner,
            creator_profile: *creator_profile,
            vault: *vault,
            destination: *destination,
            mint: *mint,
            token_program: *token_program,
        }
        .to_account_metas(None),
        data: tip_jar::instruction::Withdraw { amount }.data(),
    }
}

pub fn update_elgamal_pubkey_ix(
    program_id: &Pubkey,
    owner: &Pubkey,
    creator_profile: &Pubkey,
    new_pubkey: [u8; 32],
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: tip_jar::accounts::UpdateElgamalPubkey {
            owner: *owner,
            creator_profile: *creator_profile,
        }
        .to_account_metas(None),
        data: tip_jar::instruction::UpdateElgamalPubkey { new_pubkey }.data(),
    }
}

/// Common fixture: creator + tipper, USDC mint, tipper funded with USDC.
/// Also initializes the program Config with a treasury ATA so send_tip
/// has the accounts it needs. Defaults to fee_bps = 0.
pub struct Fixture {
    pub ctx: TestCtx,
    pub mint_authority: Keypair,
    pub mint: Pubkey,
    pub creator: Keypair,
    pub creator_profile: Pubkey,
    pub vault: Pubkey,
    pub tipper: Keypair,
    pub tipper_ata: Pubkey,
    pub config_authority: Keypair,
    pub config: Pubkey,
    pub treasury_owner: Keypair,
    pub treasury: Pubkey,
}

impl Fixture {
    pub fn new(tipper_starting_balance: u64) -> Self {
        Self::new_with_fee(tipper_starting_balance, 0)
    }

    pub fn new_with_fee(tipper_starting_balance: u64, fee_bps: u16) -> Self {
        let mut ctx = TestCtx::new();

        let mint_authority = Keypair::new();
        ctx.fund(&mint_authority.pubkey(), 5_000_000_000);
        let mint = ctx.create_usdc_mint(&mint_authority);

        // Platform config: authority + treasury ATA on the shared mint.
        let config_authority = Keypair::new();
        ctx.fund(&config_authority.pubkey(), 5_000_000_000);
        let treasury_owner = Keypair::new();
        let treasury = ctx.create_ata(&config_authority, &treasury_owner.pubkey(), &mint);
        let (config, _) = ctx.config_pda();
        let init_cfg = initialize_config_ix(
            &ctx.program_id,
            &config_authority.pubkey(),
            &config,
            &treasury,
            fee_bps,
        );
        ctx.send(init_cfg, &config_authority, &[]).unwrap();

        let creator = Keypair::new();
        ctx.fund(&creator.pubkey(), 5_000_000_000);
        let (creator_profile, _) = ctx.creator_profile_pda(&creator.pubkey());
        let (vault, _) = ctx.vault_pda(&creator_profile);

        let init_ix = initialize_creator_ix(
            &ctx.program_id,
            &creator.pubkey(),
            &mint,
            &creator_profile,
            &vault,
            &ctx.token_program,
        );
        ctx.send(init_ix, &creator, &[]).unwrap();

        let tipper = Keypair::new();
        ctx.fund(&tipper.pubkey(), 5_000_000_000);
        let tipper_ata = ctx.create_ata(&tipper, &tipper.pubkey(), &mint);

        if tipper_starting_balance > 0 {
            ctx.mint_usdc_to(&mint, &tipper_ata, &mint_authority, tipper_starting_balance);
        }

        Self {
            ctx,
            mint_authority,
            mint,
            creator,
            creator_profile,
            vault,
            tipper,
            tipper_ata,
            config_authority,
            config,
            treasury_owner,
            treasury,
        }
    }
}
