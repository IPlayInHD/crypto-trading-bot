use anchor_lang::prelude::*;

#[account]
pub struct SwapState {
    /// The wallet that owns this swap state
    pub authority: Pubkey,
    /// Amount to use as input for the next swap in the chain
    pub swap_input: u64,
    /// Balance recorded at the start of the arb sequence
    pub start_balance: u64,
    /// Whether an arb sequence is currently active
    pub is_valid: bool,
    /// Bump seed for PDA
    pub bump: u8,
}

impl SwapState {
    pub const LEN: usize = 32 + 8 + 8 + 1 + 1;
}
