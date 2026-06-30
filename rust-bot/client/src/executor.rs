use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use std::time::{Duration, Instant};
use tracing::{info, warn};

use crate::{graph::ArbitrageGraph, jito::JitoClient, pools::PoolFetcher};

const SCAN_INTERVAL_MS: u64 = 500;
const GRAPH_REFRESH_INTERVAL_SECS: u64 = 10;

pub async fn run(rpc_url: String, private_key: String, mode: String, min_profit_usd: f64) -> Result<()> {
    let keypair = parse_keypair(&private_key)?;
    let wallet_pubkey = keypair.pubkey();

    let connection = RpcClient::new_with_commitment(rpc_url.clone(), CommitmentConfig::confirmed());
    let balance = connection.get_balance(&wallet_pubkey).unwrap_or(0);
    info!(
        "Wallet: {} | Balance: {:.4} SOL",
        wallet_pubkey,
        balance as f64 / 1e9
    );

    let fetcher = PoolFetcher::new();
    let jito = JitoClient::new();
    let http = Client::new();

    let mut graph = fetcher.build_graph().await?;
    let mut last_graph_refresh = Instant::now();
    let mut scan_count: u64 = 0;
    let mut trade_count: u64 = 0;
    let mut total_profit_usd: f64 = 0.0;

    // Pivot tokens to scan from
    let pivot_tokens = vec![
        crate::pools::SOL_MINT,
        crate::pools::USDC_MINT,
    ];

    info!("Starting arbitrage loop in {} mode...", mode);

    loop {
        // Periodically refresh the graph
        if last_graph_refresh.elapsed().as_secs() >= GRAPH_REFRESH_INTERVAL_SECS {
            match fetcher.build_graph().await {
                Ok(g) => {
                    graph = g;
                    last_graph_refresh = Instant::now();
                    info!("Graph refreshed");
                }
                Err(e) => warn!("Graph refresh failed: {}", e),
            }
        }

        scan_count += 1;

        let mut best_path: Option<(Vec<String>, f64)> = None;
        for token in &pivot_tokens {
            let paths = graph.find_arbitrage_paths(token);
            if let Some(top) = paths.into_iter().next() {
                if best_path.as_ref().map(|b: &(Vec<String>, f64)| b.1).unwrap_or(0.0) < top.1 {
                    best_path = Some(top);
                }
            }
        }

        if let Some((path, ratio)) = best_path {
            // Estimate USD profit assuming 0.1 SOL trade size
            let trade_sol = 0.1_f64;
            let sol_price = get_sol_price(&http).await.unwrap_or(150.0);
            let gross_profit_usd = trade_sol * sol_price * (ratio - 1.0);
            let fees_usd = 0.003; // ~0.003 SOL in fees + jito tip
            let net_profit_usd = gross_profit_usd - fees_usd;

            if net_profit_usd >= min_profit_usd {
                info!(
                    "[Scan {}] Path: {} | Ratio: {:.6} | Net profit: ${:.4}",
                    scan_count,
                    path.join(" → "),
                    ratio,
                    net_profit_usd
                );

                if mode == "live" {
                    match execute_via_jupiter(&http, &jito, &keypair, &path, trade_sol, net_profit_usd).await {
                        Ok(sig) => {
                            trade_count += 1;
                            total_profit_usd += net_profit_usd;
                            info!(
                                "Trade #{} executed! Sig: {} | Total profit: ${:.4}",
                                trade_count, sig, total_profit_usd
                            );
                        }
                        Err(e) => warn!("Trade failed: {}", e),
                    }
                } else {
                    // Simulation
                    trade_count += 1;
                    total_profit_usd += net_profit_usd;
                    info!(
                        "[SIM] Trade #{} | Profit: ${:.4} | Total: ${:.4}",
                        trade_count, net_profit_usd, total_profit_usd
                    );
                }
            }
        }

        if scan_count % 100 == 0 {
            info!(
                "Stats: {} scans | {} trades | ${:.4} profit",
                scan_count, trade_count, total_profit_usd
            );
        }

        tokio::time::sleep(Duration::from_millis(SCAN_INTERVAL_MS)).await;
    }
}

async fn get_sol_price(client: &Client) -> Result<f64> {
    #[derive(Deserialize)]
    struct PriceResp {
        data: PriceData,
    }
    #[derive(Deserialize)]
    struct PriceData {
        #[serde(rename = "So11111111111111111111111111111111111111112")]
        sol: Option<TokenPrice>,
    }
    #[derive(Deserialize)]
    struct TokenPrice {
        price: f64,
    }

    let url = "https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112";
    let resp: PriceResp = client.get(url).send().await?.json().await?;
    Ok(resp.data.sol.map(|p| p.price).unwrap_or(150.0))
}

#[derive(Deserialize)]
struct JupiterQuote {
    #[serde(rename = "outAmount")]
    out_amount: String,
}

#[derive(Serialize)]
struct SwapRequest {
    #[serde(rename = "quoteResponse")]
    quote_response: serde_json::Value,
    #[serde(rename = "userPublicKey")]
    user_public_key: String,
    #[serde(rename = "dynamicComputeUnitLimit")]
    dynamic_compute_unit_limit: bool,
    #[serde(rename = "prioritizationFeeLamports")]
    prioritization_fee_lamports: u64,
}

#[derive(Deserialize)]
struct SwapResponse {
    #[serde(rename = "swapTransaction")]
    swap_transaction: String,
}

async fn execute_via_jupiter(
    http: &Client,
    jito: &JitoClient,
    keypair: &Keypair,
    path: &[String],
    trade_sol: f64,
    expected_profit_usd: f64,
) -> Result<String> {
    if path.len() < 3 {
        return Err(anyhow::anyhow!("Path too short"));
    }

    let amount_in = (trade_sol * 1e9) as u64;
    let input_mint = &path[0];
    let output_mint = &path[path.len() - 1];

    // Get Jupiter quote for the full route
    let quote_url = format!(
        "https://quote-api.jup.ag/v6/quote?inputMint={}&outputMint={}&amount={}&slippageBps=50",
        input_mint, output_mint, amount_in
    );

    let quote: serde_json::Value = http.get(&quote_url).send().await?.json().await?;

    // Calculate Jito tip
    let sol_price = get_sol_price(http).await.unwrap_or(150.0);
    let tip_lamports = JitoClient::calculate_tip(
        (expected_profit_usd / sol_price * 1e9) as u64
    );

    // Build swap transaction via Jupiter
    let swap_req = serde_json::json!({
        "quoteResponse": quote,
        "userPublicKey": keypair.pubkey().to_string(),
        "dynamicComputeUnitLimit": true,
        "prioritizationFeeLamports": tip_lamports,
    });

    let swap_resp: SwapResponse = http
        .post("https://quote-api.jup.ag/v6/swap")
        .json(&swap_req)
        .send()
        .await?
        .json()
        .await?;

    // Deserialize and sign the transaction
    let tx_bytes = bs58::decode(&swap_resp.swap_transaction).into_vec()?;
    let mut tx: Transaction = bincode::deserialize(&tx_bytes)?;
    tx.sign(&[keypair], tx.message.recent_blockhash);

    let signed_bytes = bincode::serialize(&tx)?;
    let signed_b58 = bs58::encode(signed_bytes).into_string();

    // Submit via Jito
    let bundle_id = jito.submit_bundle(vec![signed_b58]).await?;
    Ok(bundle_id)
}

fn parse_keypair(private_key: &str) -> Result<Keypair> {
    // Try base58 first
    if let Ok(bytes) = bs58::decode(private_key).into_vec() {
        if let Ok(kp) = Keypair::from_bytes(&bytes) {
            return Ok(kp);
        }
    }
    // Try JSON array format
    if let Ok(arr) = serde_json::from_str::<Vec<u8>>(private_key) {
        if let Ok(kp) = Keypair::from_bytes(&arr) {
            return Ok(kp);
        }
    }
    Err(anyhow::anyhow!("Invalid private key format"))
}
