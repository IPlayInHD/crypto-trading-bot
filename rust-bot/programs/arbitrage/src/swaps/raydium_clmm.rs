use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use anchor_spl::token::TokenAccount;

// Raydium CLMM program ID (mainnet)
pub const RAYDIUM_CLMM_PROGRAM: &str = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";

// Swap instruction discriminator for Raydium CLMM
const SWAP_DISCRIMINATOR: [u8; 8] = [43, 4, 237, 11, 26, 201, 30, 98];

#[derive(Accounts)]
pub struct RaydiumClmmSwap<'info> {
    /// CHECK: CLMM program
    pub clmm_program: UncheckedAccount<'info>,
    /// The payer of the transaction
    pub payer: Signer<'info>,
    /// CHECK: AMM config
    pub amm_config: UncheckedAccount<'info>,
    /// CHECK: Pool state
    #[account(mut)]
    pub pool_state: UncheckedAccount<'info>,
    /// User source token account
    #[account(mut)]
    pub input_token_account: Account<'info, TokenAccount>,
    /// User destination token account
    #[account(mut)]
    pub user_dst: Account<'info, TokenAccount>,
    /// CHECK: Input vault
    #[account(mut)]
    pub input_vault: UncheckedAccount<'info>,
    /// CHECK: Output vault
    #[account(mut)]
    pub output_vault: UncheckedAccount<'info>,
    /// CHECK: Observation state
    #[account(mut)]
    pub observation_state: UncheckedAccount<'info>,
    /// Token program
    pub token_program: Program<'info, anchor_spl::token::Token>,
    /// CHECK: Tick array accounts passed as remaining accounts
    pub swap_state: Account<'info, crate::state::SwapState>,
}

pub fn swap<'info>(
    ctx: &Context<'_, '_, '_, 'info, RaydiumClmmSwap<'info>>,
    amount: u64,
    minimum_amount_out: u64,
    sqrt_price_limit_x64: u128,
) -> Result<()> {
    let mut data = SWAP_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&minimum_amount_out.to_le_bytes());
    data.extend_from_slice(&sqrt_price_limit_x64.to_le_bytes());
    data.push(1u8); // is_base_input = true

    let mut accounts = vec![
        AccountMeta::new_readonly(*ctx.accounts.payer.key, true),
        AccountMeta::new_readonly(*ctx.accounts.amm_config.key, false),
        AccountMeta::new(*ctx.accounts.pool_state.key, false),
        AccountMeta::new(*ctx.accounts.input_token_account.key(), false),
        AccountMeta::new(*ctx.accounts.user_dst.key(), false),
        AccountMeta::new(*ctx.accounts.input_vault.key, false),
        AccountMeta::new(*ctx.accounts.output_vault.key, false),
        AccountMeta::new(*ctx.accounts.observation_state.key, false),
        AccountMeta::new_readonly(*ctx.accounts.token_program.key, false),
    ];

    // Add tick array accounts from remaining accounts
    for acc in ctx.remaining_accounts.iter() {
        accounts.push(AccountMeta::new(*acc.key, false));
    }

    let ix = Instruction {
        program_id: *ctx.accounts.clmm_program.key,
        accounts,
        data,
    };

    let mut account_infos = vec![
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.amm_config.to_account_info(),
        ctx.accounts.pool_state.to_account_info(),
        ctx.accounts.input_token_account.to_account_info(),
        ctx.accounts.user_dst.to_account_info(),
        ctx.accounts.input_vault.to_account_info(),
        ctx.accounts.output_vault.to_account_info(),
        ctx.accounts.observation_state.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
    ];

    for acc in ctx.remaining_accounts.iter() {
        account_infos.push(acc.to_account_info());
    }

    invoke(&ix, &account_infos)?;
    Ok(())
}
