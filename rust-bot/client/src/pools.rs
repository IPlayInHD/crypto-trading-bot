use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;
use tracing::{info, warn};

use crate::graph::{ArbitrageGraph, PoolEdge};

// Well-known token mints
pub const SOL_MINT: &str = "So11111111111111111111111111111111111111112";
pub const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const USDT_MINT: &str = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
pub const RAY_MINT: &str = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
pub const ORCA_MINT: &str = "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE";
pub const MSOL_MINT: &str = "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So";
pub const JUP_MINT: &str = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
pub const BONK_MINT: &str = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

#[derive(Debug, Deserialize)]
struct JupiterPriceResponse {
    data: std::collections::HashMap<String, JupiterTokenPrice>,
}

#[derive(Debug, Deserialize)]
struct JupiterTokenPrice {
    id: String,
    #[serde(rename = "mintSymbol")]
    mint_symbol: Option<String>,
    #[serde(rename = "vsToken")]
    vs_token: Option<String>,
    price: f64,
}

#[derive(Debug, Deserialize)]
struct JupiterQuoteResponse {
    #[serde(rename = "outAmount")]
    out_amount: String,
    #[serde(rename = "inAmount")]
    in_amount: String,
    #[serde(rename = "routePlan")]
    route_plan: Option<Vec<serde_json::Value>>,
}

pub struct PoolFetcher {
    client: Client,
}

impl PoolFetcher {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Build arbitrage graph using Jupiter price API + quote simulation.
    pub async fn build_graph(&self) -> Result<ArbitrageGraph> {
        let mut graph = ArbitrageGraph::new();

        let pairs = vec![
            (SOL_MINT, USDC_MINT, "SOL", "USDC"),
            (SOL_MINT, USDT_MINT, "SOL", "USDT"),
            (SOL_MINT, RAY_MINT, "SOL", "RAY"),
            (SOL_MINT, ORCA_MINT, "SOL", "ORCA"),
            (SOL_MINT, MSOL_MINT, "SOL", "mSOL"),
            (SOL_MINT, JUP_MINT, "SOL", "JUP"),
            (USDC_MINT, USDT_MINT, "USDC", "USDT"),
            (USDC_MINT, RAY_MINT, "USDC", "RAY"),
            (USDC_MINT, ORCA_MINT, "USDC", "ORCA"),
            (USDC_MINT, JUP_MINT, "USDC", "JUP"),
            (USDC_MINT, BONK_MINT, "USDC", "BONK"),
            (RAY_MINT, USDT_MINT, "RAY", "USDT"),
            (ORCA_MINT, USDC_MINT, "ORCA", "USDC"),
            (MSOL_MINT, SOL_MINT, "mSOL", "SOL"),
        ];

        for (mint_a, mint_b, sym_a, sym_b) in &pairs {
            match self.fetch_pair_rates(mint_a, mint_b, sym_a, sym_b).await {
                Ok(edge) => {
                    graph.add_pool(edge);
                }
                Err(e) => {
                    warn!("Failed to fetch {}/{}: {}", sym_a, sym_b, e);
                }
            }
        }

        info!("Graph built with {} token nodes", graph.edges.len());
        Ok(graph)
    }

    async fn fetch_pair_rates(
        &self,
        mint_a: &str,
        mint_b: &str,
        sym_a: &str,
        sym_b: &str,
    ) -> Result<PoolEdge> {
        // Use Jupiter quote API with 1 SOL or 1 USDC worth as test amount
        let amount_in: u64 = if mint_a == SOL_MINT { 1_000_000_000 } else { 1_000_000 };

        let url_a_to_b = format!(
            "https://quote-api.jup.ag/v6/quote?inputMint={}&outputMint={}&amount={}&slippageBps=50",
            mint_a, mint_b, amount_in
        );

        let url_b_to_a = format!(
            "https://quote-api.jup.ag/v6/quote?inputMint={}&outputMint={}&amount={}&slippageBps=50",
            mint_b, mint_a, amount_in
        );

        let resp_a: JupiterQuoteResponse = self
            .client
            .get(&url_a_to_b)
            .send()
            .await?
            .json()
            .await?;

        let out_a: u64 = resp_a.out_amount.parse()?;
        let price_a_to_b = out_a as f64 / amount_in as f64;

        // For b_to_a we need to adjust the input amount to be comparable
        let amount_in_b = out_a;
        let url_b_to_a_adjusted = format!(
            "https://quote-api.jup.ag/v6/quote?inputMint={}&outputMint={}&amount={}&slippageBps=50",
            mint_b, mint_a, amount_in_b
        );

        let resp_b: JupiterQuoteResponse = self
            .client
            .get(&url_b_to_a_adjusted)
            .send()
            .await?
            .json()
            .await?;

        let out_b: u64 = resp_b.out_amount.parse()?;
        let price_b_to_a = out_b as f64 / amount_in_b as f64;

        // Determine which DEX was used (take first route hop)
        let dex = resp_a
            .route_plan
            .as_ref()
            .and_then(|r| r.first())
            .and_then(|h| h.get("swapInfo"))
            .and_then(|s| s.get("label"))
            .and_then(|l| l.as_str())
            .unwrap_or("Jupiter")
            .to_string();

        Ok(PoolEdge {
            pool_address: format!("{}-{}", mint_a, mint_b),
            dex,
            token_a: mint_a.to_string(),
            token_b: mint_b.to_string(),
            price_a_to_b,
            price_b_to_a,
            liquidity_usd: 0.0, // Jupiter doesn't expose this directly
        })
    }
}
