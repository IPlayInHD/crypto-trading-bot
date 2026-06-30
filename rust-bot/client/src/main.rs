mod graph;
mod pools;
mod jito;
mod executor;

use anyhow::Result;
use dotenv::dotenv;
use std::env;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    tracing_subscriber::fmt::init();

    let rpc_url = env::var("SOLANA_RPC_URL")
        .unwrap_or_else(|_| "https://api.mainnet-beta.solana.com".to_string());
    let private_key = env::var("WALLET_PRIVATE_KEY").expect("WALLET_PRIVATE_KEY must be set");
    let mode = env::var("TRADING_MODE").unwrap_or_else(|_| "simulation".to_string());
    let min_profit_usd: f64 = env::var("MIN_PROFIT_USD")
        .unwrap_or_else(|_| "0.10".to_string())
        .parse()
        .unwrap_or(0.10);

    info!("=== Solana Arbitrage Bot (Rust) ===");
    info!("RPC: {}", rpc_url);
    info!("Mode: {}", mode);
    info!("Min profit: ${:.4}", min_profit_usd);

    executor::run(rpc_url, private_key, mode, min_profit_usd).await
}
