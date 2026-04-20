#![allow(dead_code)]

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    anchor_spl::token_interface::spl_token_2022,
    litesvm::LiteSVM,
    litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo},
    marketplace::state::{Listing, Config},
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
        let program_id = marketplace::id();
        let bytes = include_bytes!("../../../../target/deploy/marketplace.so");
        svm.add_program(program_id, bytes).unwrap();

        let mut clock = svm.get_sysvar::<solana_clock::Clock>();
        clock.unix_timestamp = 1_735_689_600;
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
    pub fn listing_pda(&self, seller: &Pubkey, asset_mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"listing", seller.as_ref(), asset_mint.as_ref()],
            &self.program_id,
        )
    }
    pub fn vault_pda(&self, listing: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vault", listing.as_ref()], &self.program_id)
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

    pub fn get_listing(&self, listing: &Pubkey) -> Listing {
        use anchor_lang::AccountDeserialize;
        let acc = self.svm.get_account(listing).unwrap();
        Listing::try_deserialize(&mut &acc.data[..]).unwrap()
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
        accounts: marketplace::accounts::InitializeConfig {
            authority: *authority,
            config: *config,
            treasury: *treasury,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: marketplace::instruction::InitializeConfig { fee_bps }.data(),
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
        accounts: marketplace::accounts::UpdateFeeBps {
            authority: *authority,
            config: *config,
        }
        .to_account_metas(None),
        data: marketplace::instruction::UpdateFeeBps { new_fee_bps }.data(),
    }
}

pub struct CreateListingAccounts<'a> {
    pub seller: &'a Pubkey,
    pub asset_mint: &'a Pubkey,
    pub payment_mint: &'a Pubkey,
    pub listing: &'a Pubkey,
    pub vault: &'a Pubkey,
    pub seller_asset_account: &'a Pubkey,
    pub token_program: &'a Pubkey,
}

pub fn create_listing_ix(
    program_id: &Pubkey,
    a: CreateListingAccounts,
    price_per_token: u64,
    quantity: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: marketplace::accounts::CreateListing {
            seller: *a.seller,
            asset_mint: *a.asset_mint,
            payment_mint: *a.payment_mint,
            listing: *a.listing,
            vault: *a.vault,
            seller_asset_account: *a.seller_asset_account,
            asset_token_program: *a.token_program,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: marketplace::instruction::CreateListing { price_per_token, quantity }.data(),
    }
}

pub struct BuyListingAccounts<'a> {
    pub buyer: &'a Pubkey,
    pub asset_mint: &'a Pubkey,
    pub payment_mint: &'a Pubkey,
    pub listing: &'a Pubkey,
    pub vault: &'a Pubkey,
    pub buyer_asset_account: &'a Pubkey,
    pub buyer_payment_account: &'a Pubkey,
    pub seller_payment_account: &'a Pubkey,
    pub config: &'a Pubkey,
    pub treasury: &'a Pubkey,
    pub token_program: &'a Pubkey,
}

pub fn buy_listing_ix(
    program_id: &Pubkey,
    a: BuyListingAccounts,
    quantity: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: marketplace::accounts::BuyListing {
            buyer: *a.buyer,
            asset_mint: *a.asset_mint,
            payment_mint: *a.payment_mint,
            listing: *a.listing,
            vault: *a.vault,
            buyer_asset_account: *a.buyer_asset_account,
            buyer_payment_account: *a.buyer_payment_account,
            seller_payment_account: *a.seller_payment_account,
            config: *a.config,
            treasury: *a.treasury,
            asset_token_program: *a.token_program,
            payment_token_program: *a.token_program,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: marketplace::instruction::BuyListing { quantity }.data(),
    }
}

pub fn update_listing_price_ix(
    program_id: &Pubkey,
    seller: &Pubkey,
    listing: &Pubkey,
    new_price: u64,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: marketplace::accounts::UpdateListingPrice {
            seller: *seller,
            listing: *listing,
        }
        .to_account_metas(None),
        data: marketplace::instruction::UpdateListingPrice { new_price }.data(),
    }
}

pub fn cancel_listing_ix(
    program_id: &Pubkey,
    seller: &Pubkey,
    asset_mint: &Pubkey,
    listing: &Pubkey,
    vault: &Pubkey,
    seller_asset_account: &Pubkey,
    token_program: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: *program_id,
        accounts: marketplace::accounts::CancelListing {
            seller: *seller,
            asset_mint: *asset_mint,
            listing: *listing,
            vault: *vault,
            seller_asset_account: *seller_asset_account,
            asset_token_program: *token_program,
        }
        .to_account_metas(None),
        data: marketplace::instruction::CancelListing {}.data(),
    }
}

/// Full-stack fixture:
/// - Config initialised (fee_bps configurable).
/// - Separate "asset" mint (RWA-like) and shared USDC mint for payments.
/// - Seller holds `seller_asset_supply` asset tokens.
/// - Buyer holds `buyer_usdc_balance` USDC.
pub struct Fixture {
    pub ctx: TestCtx,
    pub config_authority: Keypair,
    pub config: Pubkey,
    pub treasury_owner: Keypair,
    pub treasury: Pubkey,

    pub payment_mint_authority: Keypair,
    pub payment_mint: Pubkey,

    pub asset_mint_authority: Keypair,
    pub asset_mint: Pubkey,

    pub seller: Keypair,
    pub seller_asset_ata: Pubkey,
    pub seller_payment_ata: Pubkey,

    pub buyer: Keypair,
    pub buyer_payment_ata: Pubkey,
    pub buyer_asset_ata: Pubkey,
}

impl Fixture {
    pub fn new_with_fee(fee_bps: u16, seller_supply: u64, buyer_usdc: u64) -> Self {
        let mut ctx = TestCtx::new();

        // Payment mint (USDC-like).
        let payment_mint_authority = Keypair::new();
        ctx.fund(&payment_mint_authority.pubkey(), 5_000_000_000);
        let payment_mint = ctx.create_mint(&payment_mint_authority, USDC_DECIMALS);

        // Asset mint (RWA token with 0 decimals).
        let asset_mint_authority = Keypair::new();
        ctx.fund(&asset_mint_authority.pubkey(), 5_000_000_000);
        let asset_mint = ctx.create_mint(&asset_mint_authority, 0);

        // Config authority + treasury.
        let config_authority = Keypair::new();
        ctx.fund(&config_authority.pubkey(), 5_000_000_000);
        let treasury_owner = Keypair::new();
        let treasury = ctx.create_ata(&config_authority, &treasury_owner.pubkey(), &payment_mint);
        let (config, _) = ctx.config_pda();
        let init = initialize_config_ix(
            &ctx.program_id,
            &config_authority.pubkey(),
            &config,
            &treasury,
            fee_bps,
        );
        ctx.send(init, &config_authority, &[]).unwrap();

        // Seller setup.
        let seller = Keypair::new();
        ctx.fund(&seller.pubkey(), 5_000_000_000);
        let seller_asset_ata = ctx.create_ata(&seller, &seller.pubkey(), &asset_mint);
        let seller_payment_ata = ctx.create_ata(&seller, &seller.pubkey(), &payment_mint);
        if seller_supply > 0 {
            ctx.mint_to(&asset_mint, &seller_asset_ata, &asset_mint_authority, seller_supply);
        }

        // Buyer setup.
        let buyer = Keypair::new();
        ctx.fund(&buyer.pubkey(), 5_000_000_000);
        let buyer_payment_ata = ctx.create_ata(&buyer, &buyer.pubkey(), &payment_mint);
        let buyer_asset_ata = anchor_spl::associated_token::get_associated_token_address_with_program_id(
            &buyer.pubkey(),
            &asset_mint,
            &ctx.token_program,
        );
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
            asset_mint_authority,
            asset_mint,
            seller,
            seller_asset_ata,
            seller_payment_ata,
            buyer,
            buyer_payment_ata,
            buyer_asset_ata,
        }
    }
}
