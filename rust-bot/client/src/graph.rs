use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct PoolEdge {
    pub pool_address: String,
    pub dex: String,
    pub token_a: String,
    pub token_b: String,
    pub price_a_to_b: f64,
    pub price_b_to_a: f64,
    pub liquidity_usd: f64,
}

#[derive(Debug)]
pub struct ArbitrageGraph {
    // token -> list of edges
    pub edges: HashMap<String, Vec<PoolEdge>>,
}

impl ArbitrageGraph {
    pub fn new() -> Self {
        Self {
            edges: HashMap::new(),
        }
    }

    pub fn add_pool(&mut self, pool: PoolEdge) {
        self.edges
            .entry(pool.token_a.clone())
            .or_default()
            .push(pool.clone());
        self.edges
            .entry(pool.token_b.clone())
            .or_default()
            .push(pool);
    }

    /// Find triangular arbitrage paths starting and ending at `start_token`.
    /// Returns (path, estimated_profit_ratio) where ratio > 1.0 means profitable.
    pub fn find_arbitrage_paths(&self, start_token: &str) -> Vec<(Vec<String>, f64)> {
        let mut results = Vec::new();
        let edges = match self.edges.get(start_token) {
            Some(e) => e,
            None => return results,
        };

        for e1 in edges {
            let mid_token = if e1.token_a == start_token {
                &e1.token_b
            } else {
                &e1.token_a
            };
            let rate1 = if e1.token_a == start_token {
                e1.price_a_to_b
            } else {
                e1.price_b_to_a
            };

            if let Some(e2_list) = self.edges.get(mid_token) {
                for e2 in e2_list {
                    let end_token = if e2.token_a == mid_token {
                        &e2.token_b
                    } else {
                        &e2.token_a
                    };
                    if end_token == start_token {
                        continue; // skip 2-hop loops
                    }
                    let rate2 = if e2.token_a == mid_token {
                        e2.price_a_to_b
                    } else {
                        e2.price_b_to_a
                    };

                    // Third hop back to start
                    if let Some(e3_list) = self.edges.get(end_token.as_str()) {
                        for e3 in e3_list {
                            let final_token = if e3.token_a == *end_token {
                                &e3.token_b
                            } else {
                                &e3.token_a
                            };
                            if final_token != start_token {
                                continue;
                            }
                            let rate3 = if e3.token_a == *end_token {
                                e3.price_a_to_b
                            } else {
                                e3.price_b_to_a
                            };

                            let ratio = rate1 * rate2 * rate3;
                            // Only surface paths with > 0.1% gross profit
                            if ratio > 1.001 {
                                let path = vec![
                                    start_token.to_string(),
                                    mid_token.clone(),
                                    end_token.clone(),
                                    start_token.to_string(),
                                ];
                                results.push((path, ratio));
                            }
                        }
                    }
                }
            }
        }

        // Sort by profit ratio descending
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        results
    }
}
