use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use anchor_spl::token::TokenAccount;

// Meteora DLMM program ID (mainnet)
pub const METEORA_DLMM_PROGRAM: &str = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";

// Swap instruction discriminator for Meteora DLMM
const SWAP_DISCRIMINATOR: [u8; 8] = [248, 198, 158, 145, 225, 117, 135, 200];

#[derive(Accounts)]
pub struct MeteoraSwap<'info> {
    /// CHECK: Meteora DLMM program
    pub lb_clmm_program: UncheckedAccount<'info>,
    /// CHECK: LB pair (pool state)
    #[account(mut)]
    pub lb_pair: UncheckedAccount<'info>,
    /// CHECK: Bin array bitmap extension
    #[account(mut)]
    pub bin_array_bitmap_extension: UncheckedAccount<'info>,
    /// User source token account
    #[account(mut)]
    pub user_token_in: Account<'info, TokenAccount>,
    /// User destination token account
    #[account(mut)]
    pub user_token_out: Account<'info, TokenAccount>,
    /// CHECK: Reserve X (token X vault)
    #[account(mut)]
    pub reserve_x: UncheckedAccount<'info>,
    /// CHECK: Reserve Y (token Y vault)
    #[account(mut)]
    pub reserve_y: UncheckedAccount<'info>,
    /// CHECK: Token X mint
    pub token_x_mint: UncheckedAccount<'info>,
    /// CHECK: Token Y mint
    pub token_y_mint: UncheckedAccount<'info>,
    /// CHECK: Oracle account
    #[account(mut)]
    pub oracle: UncheckedAccount<'info>,
    /// CHECK: Host fee account (can be system program)
    pub host_fee_in: UncheckedAccount<'info>,
    /// The user signing the swap
    pub user: Signer<'info>,
    /// Token program
    pub token_x_program: Program<'info, anchor_spl::token::Token>,
    /// Token program for Y
    pub token_y_program: Program<'info, anchor_spl::token::Token>,
    /// Event authority for CPI events
    /// CHECK: Event authority PDA
    pub event_authority: UncheckedAccount<'info>,
    /// CHECK: Program itself (required for self-CPI event emission)
    pub program: UncheckedAccount<'info>,
    /// Swap state
    pub swap_state: Account<'info, crate::state::SwapState>,
}

pub fn swap<'info>(
    ctx: &Context<'_, '_, '_, 'info, MeteoraSwap<'info>>,
    amount_in: u64,
    minimum_amount_out: u64,
    swap_for_y: bool,
) -> Result<()> {
    let mut data = SWAP_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&amount_in.to_le_bytes());
    data.extend_from_slice(&minimum_amount_out.to_le_bytes());
    data.push(swap_for_y as u8);

    let mut accounts = vec![
        AccountMeta::new(*ctx.accounts.lb_pair.key, false),
        AccountMeta::new(*ctx.accounts.bin_array_bitmap_extension.key, false),
        AccountMeta::new(*ctx.accounts.user_token_in.key(), false),
        AccountMeta::new(*ctx.accounts.user_token_out.key(), false),
        AccountMeta::new(*ctx.accounts.reserve_x.key, false),
        AccountMeta::new(*ctx.accounts.reserve_y.key, false),
        AccountMeta::new_readonly(*ctx.accounts.token_x_mint.key, false),
        AccountMeta::new_readonly(*ctx.accounts.token_y_mint.key, false),
        AccountMeta::new(*ctx.accounts.oracle.key, false),
        AccountMeta::new_readonly(*ctx.accounts.host_fee_in.key, false),
        AccountMeta::new_readonly(*ctx.accounts.user.key, true),
        AccountMeta::new_readonly(*ctx.accounts.token_x_program.key, false),
        AccountMeta::new_readonly(*ctx.accounts.token_y_program.key, false),
        AccountMeta::new_readonly(*ctx.accounts.event_authority.key, false),
        AccountMeta::new_readonly(*ctx.accounts.program.key, false),
    ];

    // Remaining accounts are bin arrays
    for acc in ctx.remaining_accounts.iter() {
        accounts.push(AccountMeta::new(*acc.key, false));
    }

    let ix = Instruction {
        program_id: *ctx.accounts.lb_clmm_program.key,
        accounts,
        data,
    };

    let mut account_infos = vec![
        ctx.accounts.lb_pair.to_account_info(),
        ctx.accounts.bin_array_bitmap_extension.to_account_info(),
        ctx.accounts.user_token_in.to_account_info(),
        ctx.accounts.user_token_out.to_account_info(),
        ctx.accounts.reserve_x.to_account_info(),
        ctx.accounts.reserve_y.to_account_info(),
        ctx.accounts.token_x_mint.to_account_info(),
        ctx.accounts.token_y_mint.to_account_info(),
        ctx.accounts.oracle.to_account_info(),
        ctx.accounts.host_fee_in.to_account_info(),
        ctx.accounts.user.to_account_info(),
        ctx.accounts.token_x_program.to_account_info(),
        ctx.accounts.token_y_program.to_account_info(),
        ctx.accounts.event_authority.to_account_info(),
        ctx.accounts.program.to_account_info(),
    ];

    for acc in ctx.remaining_accounts.iter() {
        account_infos.push(acc.to_account_info());
    }

    invoke(&ix, &account_infos)?;
    Ok(())
}
