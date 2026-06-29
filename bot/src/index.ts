import axios from 'axios';
import { config } from './config';
import { logger } from './utils/logger';
import { scanForOpportunities, updateSolPrice, getSolPrice } from './arbitrage/scanner';
import { executeArbitrage, initializeExecutor, getWalletBalance } from './arbitrage/executor';
import { startWebSocketServer, broadcast, broadcastStats } from './server/websocket';
import { ArbitrageOpportunity, BotStats, TradeExecution, PriceUpdate } from './types';
import { TOKENS } from './config';
import fs from 'fs';

// Ensure logs directory exists
if (!fs.existsSync('logs')) fs.mkdirSync('logs');

// In-memory state
const recentTrades: TradeExecution[] = [];
const recentOpportunities: ArbitrageOpportunity[] = [];
const priceHistory: Map<string, number[]> = new Map();

const stats: BotStats = {
  isRunning: false,
  mode: config.tradingMode,
  startTime: Date.now(),
  totalScans: 0,
  opportunitiesFound: 0,
  tradesExecuted: 0,
  tradesSuccessful: 0,
  tradesFailed: 0,
  totalProfitUSD: 0,
  totalFeesUSD: 0,
  netProfitUSD: 0,
  winRate: 0,
  avgProfitPerTrade: 0,
  bestTrade: 0,
  walletBalanceSOL: 0,
  walletBalanceUSD: 0,
  scanIntervalMs: config.scanIntervalMs,
  lastScanTime: 0,
};

async function fetchSolPrice(): Promise<void> {
  try {
    const res = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { timeout: 5000 }
    );
    const price = res.data?.solana?.usd;
    if (price) {
      updateSolPrice(price);
      stats.walletBalanceUSD = stats.walletBalanceSOL * price;
    }
  } catch {
    // Keep last known price
  }
}

async function fetchTokenPrices(): Promise<void> {
  try {
    const mints = [
      TOKENS.SOL.mint,
      TOKENS.USDC.mint,
      TOKENS.RAY.mint,
      TOKENS.JUP.mint,
      TOKENS.BONK.mint,
    ].join(',');

    const res = await axios.get(`https://price.jup.ag/v4/price?ids=${mints}`, { timeout: 5000 });
    const data = res.data?.data || {};

    const updates: PriceUpdate[] = [];
    for (const [mint, info] of Object.entries(data) as [string, { price: number; id: string }][]) {
      const token = Object.values(TOKENS).find((t) => t.mint === mint);
      if (!token) continue;

      const history = priceHistory.get(token.symbol) || [];
      const prevPrice = history[history.length - 1] || info.price;
      const change = ((info.price - prevPrice) / prevPrice) * 100;

      history.push(info.price);
      if (history.length > 100) history.shift();
      priceHistory.set(token.symbol, history);

      updates.push({
        pair: `${token.symbol}/USD`,
        dex: 'Jupiter',
        price: info.price,
        change24h: change,
        volume24h: 0,
        timestamp: Date.now(),
      });
    }

    if (updates.length > 0) {
      broadcast({ type: 'price_update', payload: updates, timestamp: Date.now() });
    }
  } catch {
    // Non-critical, ignore
  }
}

async function runScanCycle(): Promise<void> {
  const scanStart = Date.now();
  stats.totalScans++;
  stats.lastScanTime = scanStart;

  try {
    const opportunities = await scanForOpportunities();
    stats.lastScanTime = Date.now();

    if (opportunities.length > 0) {
      stats.opportunitiesFound += opportunities.length;
      logger.info(`Found ${opportunities.length} arbitrage opportunities`);

      // Broadcast top opportunities
      for (const opp of opportunities.slice(0, 5)) {
        recentOpportunities.unshift(opp);
        broadcast({ type: 'opportunity', payload: opp, timestamp: Date.now() });
      }

      // Keep only last 50
      if (recentOpportunities.length > 50) recentOpportunities.splice(50);

      // Execute best opportunity if above threshold
      const best = opportunities[0];
      if (
        best.estimatedProfitUSD >= config.minProfitUSD &&
        best.confidence !== 'low'
      ) {
        stats.tradesExecuted++;
        const trade = await executeArbitrage(best);
        recentTrades.unshift(trade);
        if (recentTrades.length > 100) recentTrades.splice(100);

        if (trade.status === 'success' && trade.actualProfit !== null) {
          stats.tradesSuccessful++;
          stats.totalProfitUSD += trade.actualProfit;
          stats.totalFeesUSD += trade.gasFeesSOL * getSolPrice();
          stats.netProfitUSD = stats.totalProfitUSD - stats.totalFeesUSD;
          stats.bestTrade = Math.max(stats.bestTrade, trade.actualProfit);
        } else {
          stats.tradesFailed++;
        }

        stats.winRate = stats.tradesSuccessful / stats.tradesExecuted;
        stats.avgProfitPerTrade =
          stats.tradesSuccessful > 0 ? stats.totalProfitUSD / stats.tradesSuccessful : 0;

        broadcast({ type: 'trade', payload: trade, timestamp: Date.now() });
        logger.info(
          `Trade ${trade.status}: ${trade.tokenIn}→${trade.tokenOut} | ` +
          `profit: $${(trade.actualProfit ?? 0).toFixed(4)} | ` +
          `time: ${trade.executionTimeMs}ms`
        );
      }
    } else {
      logger.debug(`No opportunities found in this scan (${Date.now() - scanStart}ms)`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Scan cycle error: ${message}`);
  }

  // Update wallet balance every 10 scans
  if (stats.totalScans % 10 === 0) {
    stats.walletBalanceSOL = await getWalletBalance();
    stats.walletBalanceUSD = stats.walletBalanceSOL * getSolPrice();
  }

  broadcastStats(stats);
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('  Solana Arbitrage Bot Starting');
  logger.info(`  Mode: ${config.tradingMode.toUpperCase()}`);
  logger.info(`  Min Profit: $${config.minProfitUSD}`);
  logger.info(`  Max Trade Size: ${config.maxTradeSizeSOL} SOL`);
  logger.info(`  Scan Interval: ${config.scanIntervalMs}ms`);
  logger.info('='.repeat(60));

  // Start WebSocket server for dashboard
  startWebSocketServer();

  // Initialize executor
  initializeExecutor();

  // Fetch initial SOL price
  await fetchSolPrice();
  logger.info(`SOL price: $${getSolPrice()}`);

  stats.isRunning = true;
  stats.startTime = Date.now();

  // Price update interval (every 30s)
  setInterval(fetchSolPrice, 30_000);
  setInterval(fetchTokenPrices, 10_000);
  fetchTokenPrices();

  // Main arbitrage scan loop
  const scan = async () => {
    if (stats.isRunning) {
      await runScanCycle();
    }
  };

  // Run immediately then on interval
  await scan();
  const interval = setInterval(scan, config.scanIntervalMs);

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Shutting down bot...');
    stats.isRunning = false;
    clearInterval(interval);

    logger.info(`\nSession Summary:`);
    logger.info(`  Total Scans: ${stats.totalScans}`);
    logger.info(`  Opportunities Found: ${stats.opportunitiesFound}`);
    logger.info(`  Trades Executed: ${stats.tradesExecuted}`);
    logger.info(`  Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
    logger.info(`  Net Profit: $${stats.netProfitUSD.toFixed(4)}`);
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
