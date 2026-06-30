use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use anchor_spl::token::TokenAccount;

// Raydium AMM v4 program ID (mainnet)
pub const RAYDIUM_AMM_PROGRAM: &str = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";

#[derive(Accounts)]
pub struct RaydiumSwap<'info> {
    /// CHECK: Raydium AMM program
    pub amm_program: UncheckedAccount<'info>,
    /// CHECK: AMM account
    #[account(mut)]
    pub amm: UncheckedAccount<'info>,
    /// CHECK: AMM authority
    pub amm_authority: UncheckedAccount<'info>,
    /// CHECK: AMM open orders
    #[account(mut)]
    pub amm_open_orders: UncheckedAccount<'info>,
    /// CHECK: AMM target orders
    #[account(mut)]
    pub amm_target_orders: UncheckedAccount<'info>,
    /// CHECK: Pool coin token account
    #[account(mut)]
    pub pool_coin_token_account: UncheckedAccount<'info>,
    /// CHECK: Pool pc token account
    #[account(mut)]
    pub pool_pc_token_account: UncheckedAccount<'info>,
    /// CHECK: Serum program (still required by Raydium v4)
    pub serum_program: UncheckedAccount<'info>,
    /// CHECK: Serum market
    #[account(mut)]
    pub serum_market: UncheckedAccount<'info>,
    /// CHECK: Serum bids
    #[account(mut)]
    pub serum_bids: UncheckedAccount<'info>,
    /// CHECK: Serum asks
    #[account(mut)]
    pub serum_asks: UncheckedAccount<'info>,
    /// CHECK: Serum event queue
    #[account(mut)]
    pub serum_event_queue: UncheckedAccount<'info>,
    /// CHECK: Serum coin vault
    #[account(mut)]
    pub serum_coin_vault_account: UncheckedAccount<'info>,
    /// CHECK: Serum pc vault
    #[account(mut)]
    pub serum_pc_vault_account: UncheckedAccount<'info>,
    /// CHECK: Serum vault signer
    pub serum_vault_signer: UncheckedAccount<'info>,
    /// User source token account
    #[account(mut)]
    pub user_src: Account<'info, TokenAccount>,
    /// User destination token account
    #[account(mut)]
    pub user_dst: Account<'info, TokenAccount>,
    /// User wallet (signer)
    pub user_owner: Signer<'info>,
    /// SPL Token program
    pub token_program: Program<'info, anchor_spl::token::Token>,
    /// Swap state
    #[account(mut)]
    pub swap_state: Account<'info, crate::state::SwapState>,
}

pub fn swap<'info>(
    ctx: &Context<'_, '_, '_, 'info, RaydiumSwap<'info>>,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    // Raydium AMM v4 swap instruction discriminator = 9
    let instruction_data = {
        let mut data = vec![9u8]; // swap instruction
        data.extend_from_slice(&amount_in.to_le_bytes());
        data.extend_from_slice(&minimum_amount_out.to_le_bytes());
        data
    };

    let accounts = vec![
        AccountMeta::new_readonly(*ctx.accounts.amm_program.key, false),
        AccountMeta::new(*ctx.accounts.amm.key, false),
        AccountMeta::new_readonly(*ctx.accounts.amm_authority.key, false),
        AccountMeta::new(*ctx.accounts.amm_open_orders.key, false),
        AccountMeta::new(*ctx.accounts.amm_target_orders.key, false),
        AccountMeta::new(*ctx.accounts.pool_coin_token_account.key, false),
        AccountMeta::new(*ctx.accounts.pool_pc_token_account.key, false),
        AccountMeta::new_readonly(*ctx.accounts.serum_program.key, false),
        AccountMeta::new(*ctx.accounts.serum_market.key, false),
        AccountMeta::new(*ctx.accounts.serum_bids.key, false),
        AccountMeta::new(*ctx.accounts.serum_asks.key, false),
        AccountMeta::new(*ctx.accounts.serum_event_queue.key, false),
        AccountMeta::new(*ctx.accounts.serum_coin_vault_account.key, false),
        AccountMeta::new(*ctx.accounts.serum_pc_vault_account.key, false),
        AccountMeta::new_readonly(*ctx.accounts.serum_vault_signer.key, false),
        AccountMeta::new(*ctx.accounts.user_src.key(), false),
        AccountMeta::new(*ctx.accounts.user_dst.key(), false),
        AccountMeta::new_readonly(*ctx.accounts.user_owner.key, true),
        AccountMeta::new_readonly(*ctx.accounts.token_program.key, false),
    ];

    let raydium_program_id = ctx.accounts.amm_program.key();

    let ix = Instruction {
        program_id: raydium_program_id,
        accounts,
        data: instruction_data,
    };

    let account_infos = vec![
        ctx.accounts.amm_program.to_account_info(),
        ctx.accounts.amm.to_account_info(),
        ctx.accounts.amm_authority.to_account_info(),
        ctx.accounts.amm_open_orders.to_account_info(),
        ctx.accounts.amm_target_orders.to_account_info(),
        ctx.accounts.pool_coin_token_account.to_account_info(),
        ctx.accounts.pool_pc_token_account.to_account_info(),
        ctx.accounts.serum_program.to_account_info(),
        ctx.accounts.serum_market.to_account_info(),
        ctx.accounts.serum_bids.to_account_info(),
        ctx.accounts.serum_asks.to_account_info(),
        ctx.accounts.serum_event_queue.to_account_info(),
        ctx.accounts.serum_coin_vault_account.to_account_info(),
        ctx.accounts.serum_pc_vault_account.to_account_info(),
        ctx.accounts.serum_vault_signer.to_account_info(),
        ctx.accounts.user_src.to_account_info(),
        ctx.accounts.user_dst.to_account_info(),
        ctx.accounts.user_owner.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
    ];

    invoke(&ix, &account_infos)?;
    Ok(())
}
