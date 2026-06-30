use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use solana_sdk::transaction::Transaction;
use tracing::info;

const JITO_BLOCK_ENGINES: &[&str] = &[
    "https://mainnet.block-engine.jito.labs.io",
    "https://ny.mainnet.block-engine.jito.labs.io",
    "https://amsterdam.mainnet.block-engine.jito.labs.io",
];

// Jito tip accounts (one is chosen at random per bundle)
const JITO_TIP_ACCOUNTS: &[&str] = &[
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt13ij12rE",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

#[derive(Serialize)]
struct BundleRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: Vec<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
struct BundleResponse {
    result: Option<String>,
    error: Option<serde_json::Value>,
}

pub struct JitoClient {
    client: Client,
}

impl JitoClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Submit a bundle to Jito block engine.
    /// `transactions` should be serialized base58-encoded signed transactions.
    pub async fn submit_bundle(&self, transactions: Vec<String>) -> Result<String> {
        let request = BundleRequest {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: "sendBundle".to_string(),
            params: vec![serde_json::json!(transactions)],
        };

        // Try each block engine
        for engine in JITO_BLOCK_ENGINES {
            let url = format!("{}/api/v1/bundles", engine);
            match self.client.post(&url).json(&request).send().await {
                Ok(resp) => {
                    if let Ok(body) = resp.json::<BundleResponse>().await {
                        if let Some(bundle_id) = body.result {
                            info!("Bundle submitted: {} via {}", bundle_id, engine);
                            return Ok(bundle_id);
                        }
                        if let Some(err) = body.error {
                            return Err(anyhow!("Jito error: {}", err));
                        }
                    }
                }
                Err(e) => {
                    info!("Block engine {} failed: {}, trying next", engine, e);
                    continue;
                }
            }
        }

        Err(anyhow!("All Jito block engines failed"))
    }

    /// Get a random Jito tip account.
    pub fn random_tip_account() -> &'static str {
        let idx = (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .subsec_nanos() as usize)
            % JITO_TIP_ACCOUNTS.len();
        JITO_TIP_ACCOUNTS[idx]
    }

    /// Calculate tip amount: 50% of expected profit, minimum 5000 lamports.
    pub fn calculate_tip(expected_profit_lamports: u64) -> u64 {
        let tip = expected_profit_lamports / 2;
        tip.max(5_000)
    }

    pub async fn get_tip_floor(&self) -> Result<u64> {
        let url = "https://bundles.jito.wtf/api/v1/bundles/tip_floor";
        #[derive(Deserialize)]
        struct TipFloor {
            landed_tips_50th_percentile: f64,
        }
        let resp: Vec<TipFloor> = self.client.get(url).send().await?.json().await?;
        if let Some(first) = resp.first() {
            Ok((first.landed_tips_50th_percentile * 1e9) as u64)
        } else {
            Ok(1_000) // 0.000001 SOL default
        }
    }
}
