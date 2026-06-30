import axios from 'axios';
import { config } from './config';
import { logger } from './utils/logger';
import { scanForOpportunities, updateSolPrice, getSolPrice } from './arbitrage/scanner';
import { executeArbitrage, initializeExecutor, getWalletBalance } from './arbitrage/executor';
import { startWebSocketServer, broadcast, broadcastStats } from './server/websocket';
import { ArbitrageOpportunity, BotStats, TradeExecution, PriceUpdate } from './types';
import { TOKENS } from './config';
import { getJitoTipFloor } from './jito/bundle';
import fs from 'fs';

if (!fs.existsSync('logs')) fs.mkdirSync('logs');

const recentTrades: TradeExecution[] = [];
const recentOpportunities: ArbitrageOpportunity[] = [];
const priceHistory: Map<string, number[]> = new Map();

// Track in-flight execution to prevent overlapping trades
let isExecuting = false;

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
      TOKENS.WIF.mint,
    ].join(',');

    const res = await axios.get(`https://price.jup.ag/v4/price?ids=${mints}`, { timeout: 5000 });
    const data = res.data?.data || {};

    const updates: PriceUpdate[] = [];
    for (const [mint, info] of Object.entries(data) as [string, { price: number }][]) {
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
    // Non-critical
  }
}

async function runScanCycle(): Promise<void> {
  // Skip if already executing a trade to prevent overlapping
  if (isExecuting) {
    logger.debug('Skipping scan — trade execution in progress');
    return;
  }

  const scanStart = Date.now();
  stats.totalScans++;
  stats.lastScanTime = scanStart;

  try {
    const opportunities = await scanForOpportunities();

    if (opportunities.length > 0) {
      stats.opportunitiesFound += opportunities.length;

      // Broadcast top 5 to dashboard
      for (const opp of opportunities.slice(0, 5)) {
        recentOpportunities.unshift(opp);
        broadcast({ type: 'opportunity', payload: opp, timestamp: Date.now() });
      }
      if (recentOpportunities.length > 50) recentOpportunities.splice(50);

      // Execute best opportunity — only medium/high confidence
      const best = opportunities[0];
      const meetsThreshold =
        best.estimatedProfitUSD >= config.minProfitUSD &&
        best.confidence !== 'low';

      if (meetsThreshold) {
        isExecuting = true;
        stats.tradesExecuted++;

        try {
          const trade = await executeArbitrage(best);
          recentTrades.unshift(trade);
          if (recentTrades.length > 100) recentTrades.splice(100);

          if (trade.status === 'success' && trade.actualProfit !== null) {
            stats.tradesSuccessful++;
            stats.totalProfitUSD += trade.actualProfit;
            stats.totalFeesUSD += trade.gasFeesSOL * getSolPrice();
            stats.netProfitUSD = stats.totalProfitUSD - stats.totalFeesUSD;
            stats.bestTrade = Math.max(stats.bestTrade, trade.actualProfit);
          } else if (trade.status === 'failed') {
            stats.tradesFailed++;
          } else if (trade.status === 'skipped') {
            stats.tradesExecuted--; // Don't count skipped as executed
          }

          stats.winRate =
            stats.tradesExecuted > 0
              ? stats.tradesSuccessful / stats.tradesExecuted
              : 0;
          stats.avgProfitPerTrade =
            stats.tradesSuccessful > 0
              ? stats.totalProfitUSD / stats.tradesSuccessful
              : 0;

          broadcast({ type: 'trade', payload: trade, timestamp: Date.now() });

          const icon = trade.status === 'success' ? '✅' : trade.status === 'skipped' ? '⏭️' : '❌';
          logger.info(
            `${icon} Trade ${trade.status}: ${trade.tokenIn}→${trade.tokenOut} ` +
            `| profit: $${(trade.actualProfit ?? 0).toFixed(4)} ` +
            `| time: ${trade.executionTimeMs}ms`
          );
        } finally {
          isExecuting = false;
        }
      }
    } else {
      logger.debug(`No opportunities (${Date.now() - scanStart}ms)`);
    }
  } catch (err: unknown) {
    isExecuting = false;
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Scan cycle error: ${message}`);
  }

  // Update wallet balance every 20 scans
  if (stats.totalScans % 20 === 0) {
    stats.walletBalanceSOL = await getWalletBalance();
    stats.walletBalanceUSD = stats.walletBalanceSOL * getSolPrice();
  }

  broadcastStats(stats);
}

async function main() {
  logger.info('='.repeat(60));
  logger.info('  Solana Arbitrage Bot — Jito Bundle Edition');
  logger.info(`  Mode: ${config.tradingMode.toUpperCase()}`);
  logger.info(`  Min Profit: $${config.minProfitUSD}`);
  logger.info(`  Max Trade Size: ${config.maxTradeSizeSOL} SOL`);
  logger.info(`  Scan Interval: ${config.scanIntervalMs}ms`);
  logger.info(`  Pairs: ${(await import('./config')).SCAN_PAIRS.length} cross-DEX + ${(await import('./config')).TRIANGULAR_PATHS.length} triangular`);
  logger.info('='.repeat(60));

  startWebSocketServer();
  initializeExecutor();

  await fetchSolPrice();
  logger.info(`SOL price: $${getSolPrice()}`);

  // Fetch initial Jito tip floor
  const tipFloor = await getJitoTipFloor();
  logger.info(`Jito tip floor: ${tipFloor} lamports (~$${((tipFloor / 1e9) * getSolPrice()).toFixed(5)})`);

  stats.isRunning = true;
  stats.startTime = Date.now();

  // Background refresh intervals
  setInterval(fetchSolPrice, 30_000);
  setInterval(fetchTokenPrices, 8_000);
  fetchTokenPrices();

  // Main scan loop — non-overlapping
  const scan = async () => {
    if (stats.isRunning) await runScanCycle();
  };

  await scan();
  const interval = setInterval(scan, config.scanIntervalMs);

  process.on('SIGINT', () => {
    logger.info('\nShutting down...');
    stats.isRunning = false;
    clearInterval(interval);
    logger.info(`Session: ${stats.totalScans} scans | ${stats.tradesExecuted} trades | ${(stats.winRate * 100).toFixed(1)}% win rate | $${stats.netProfitUSD.toFixed(4)} net profit`);
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
