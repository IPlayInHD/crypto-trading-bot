use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Swap did not result in profit — transaction reverted")]
    NoProfit,
    #[msg("Swap state is not valid or already used")]
    InvalidState,
    #[msg("Unauthorized — only the authority can call this")]
    Unauthorized,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Invalid pool accounts provided")]
    InvalidPool,
    #[msg("Insufficient funds for swap")]
    InsufficientFunds,
}
