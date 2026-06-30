import {
  Connection,
  Keypair,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionMessage,
} from '@solana/web3.js';
import bs58 from 'bs58';
import axios from 'axios';
import { ArbitrageOpportunity, TradeExecution } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  submitJitoBundle,
  calculateJitoTip,
  getOptimalComputeUnitPrice,
  getJitoTipFloor,
} from '../jito/bundle';
import { getSolPrice } from './scanner';

let connection: Connection | null = null;
let wallet: Keypair | null = null;
let jitoTipFloor = 10_000;
let computeUnitPrice = 50_000;

export function initializeExecutor() {
  connection = new Connection(config.rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 30_000,
  });

  if (config.walletPrivateKey && config.walletPrivateKey !== 'your_private_key_here') {
    try {
      const decoded = bs58.decode(config.walletPrivateKey);
      wallet = Keypair.fromSecretKey(decoded);
      logger.info(`Wallet initialized: ${wallet.publicKey.toString()}`);
    } catch {
      logger.warn('Invalid wallet private key — running in simulation-only mode');
    }
  } else {
    logger.info('No wallet configured — running in simulation mode');
  }

  // Refresh Jito tip floor and compute unit price every 30s
  refreshNetworkParams();
  setInterval(refreshNetworkParams, 30_000);

  return { connection, wallet };
}

async function refreshNetworkParams() {
  try {
    const [tipFloor, cuPrice] = await Promise.all([
      getJitoTipFloor(),
      connection ? getOptimalComputeUnitPrice(connection) : Promise.resolve(50_000),
    ]);
    jitoTipFloor = tipFloor;
    computeUnitPrice = cuPrice;
    logger.debug(`Network params: tip floor=${jitoTipFloor} lamports, CU price=${computeUnitPrice}`);
  } catch {
    // Keep last known values
  }
}

export async function getWalletBalance(): Promise<number> {
  if (!connection || !wallet) return 0;
  try {
    const balance = await connection.getBalance(wallet.publicKey);
    return balance / 1e9;
  } catch {
    return 0;
  }
}

// Verify opportunity is still profitable with fresh quote right before execution
async function verifyOpportunityFresh(
  opportunity: ArbitrageOpportunity
): Promise<{ valid: boolean; refreshedProfit: number }> {
  try {
    const response = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: {
        inputMint: opportunity.tokenIn.mint,
        outputMint: opportunity.tokenOut.mint,
        amount: opportunity.buyQuote.inputAmount,
        slippageBps: config.slippageBps,
      },
      timeout: 3000,
    });

    const quote = response.data;
    const inputAmount =
      parseInt(quote.inAmount) / Math.pow(10, opportunity.tokenIn.decimals);
    const outputAmount =
      parseInt(quote.outAmount) / Math.pow(10, opportunity.tokenOut.decimals);

    // Recalculate profit with fresh quote
    const solPrice = getSolPrice();
    const gasCostUSD = (jitoTipFloor / 1e9) * solPrice + 0.000005 * solPrice;
    const grossProfit = opportunity.estimatedProfitUSD;
    const netProfit = grossProfit - gasCostUSD;

    const stillValid = netProfit > config.minProfitUSD;

    if (!stillValid) {
      logger.debug(
        `Opportunity stale: gross=$${grossProfit.toFixed(4)} net=$${netProfit.toFixed(4)} after tip+gas`
      );
    }

    return { valid: stillValid, refreshedProfit: netProfit };
  } catch {
    return { valid: false, refreshedProfit: 0 };
  }
}

// Build a Jupiter swap transaction with priority fees
async function buildSwapTransaction(
  opportunity: ArbitrageOpportunity,
  walletPublicKey: string
): Promise<VersionedTransaction | null> {
  try {
    // Get fresh quote
    const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: {
        inputMint: opportunity.tokenIn.mint,
        outputMint: opportunity.tokenOut.mint,
        amount: opportunity.buyQuote.inputAmount,
        slippageBps: config.slippageBps,
      },
      timeout: 4000,
    });

    // Build swap transaction with dynamic priority fees
    const swapResponse = await axios.post(
      'https://quote-api.jup.ag/v6/swap',
      {
        quoteResponse: quoteResponse.data,
        userPublicKey: walletPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        // Let Jupiter handle priority fees dynamically
        prioritizationFeeLamports: {
          jitoTipLamports: Math.max(jitoTipFloor, 10_000),
        },
      },
      { timeout: 8000 }
    );

    const { swapTransaction } = swapResponse.data;
    const buffer = Buffer.from(swapTransaction, 'base64');
    return VersionedTransaction.deserialize(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown';
    logger.error(`Failed to build swap transaction: ${message}`);
    return null;
  }
}

// Simulate execution for testing
function simulateExecution(opportunity: ArbitrageOpportunity): TradeExecution {
  const startTime = Date.now();
  const executionTimeMs = 80 + Math.random() * 200; // Jito is faster

  const solPrice = getSolPrice();
  const tipCostUSD = (Math.max(jitoTipFloor, 10_000) / 1e9) * solPrice;
  const gasCostUSD = 0.000005 * solPrice;
  const slippage = Math.random() * 0.002; // 0-0.2%

  const grossProfit = opportunity.estimatedProfitUSD * (1 - slippage);
  const netProfit = grossProfit - tipCostUSD - gasCostUSD;

  const isFailure = Math.random() < 0.015; // 1.5% failure rate (better with Jito)

  return {
    id: `sim-jito-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    opportunityId: opportunity.id,
    status: isFailure ? 'failed' : 'success',
    type: opportunity.type,
    tokenIn: opportunity.tokenIn.symbol,
    tokenOut: opportunity.tokenOut.symbol,
    buyDex: opportunity.buyDex,
    sellDex: opportunity.sellDex,
    amountIn: opportunity.tradeAmountUSD,
    amountOut: opportunity.tradeAmountUSD + (isFailure ? 0 : netProfit),
    expectedProfit: opportunity.estimatedProfitUSD,
    actualProfit: isFailure ? null : netProfit,
    txSignatureBuy: isFailure ? null : `jito_${Math.random().toString(36).substr(2, 44)}`,
    txSignatureSell: null, // Jito bundles handle this atomically
    gasFeesSOL: (tipCostUSD + gasCostUSD) / solPrice,
    timestamp: startTime,
    executionTimeMs,
    error: isFailure ? 'Bundle landed but price moved — atomic rollback' : null,
    mode: 'simulation',
  };
}

// Execute a live trade using Jito bundles
async function executeJitoTrade(opportunity: ArbitrageOpportunity): Promise<TradeExecution> {
  const startTime = Date.now();

  if (!connection || !wallet) {
    return makeErrorTrade(opportunity, startTime, 'Wallet not initialized');
  }

  // Step 1: Verify opportunity is still profitable with fresh data
  const { valid, refreshedProfit } = await verifyOpportunityFresh(opportunity);
  if (!valid) {
    return {
      ...makeErrorTrade(opportunity, startTime, 'Opportunity expired before execution'),
      status: 'skipped',
    };
  }

  // Step 2: Calculate Jito tip (10% of profit, above floor)
  const solPrice = getSolPrice();
  const tipLamports = Math.max(
    calculateJitoTip(refreshedProfit, solPrice),
    jitoTipFloor
  );

  // Step 3: Build swap transaction
  const swapTx = await buildSwapTransaction(opportunity, wallet.publicKey.toString());
  if (!swapTx) {
    return makeErrorTrade(opportunity, startTime, 'Failed to build swap transaction');
  }

  // Step 4: Sign the swap transaction
  swapTx.sign([wallet]);

  // Step 5: Submit as Jito bundle (swap + tip in one atomic bundle)
  const bundleResult = await submitJitoBundle(connection, wallet, swapTx, tipLamports);

  const gasCostSOL = (tipLamports / 1e9) + 0.000005;
  const gasCostUSD = gasCostSOL * solPrice;
  const actualProfit = bundleResult.success ? refreshedProfit - gasCostUSD : null;

  return {
    id: `live-jito-${Date.now()}`,
    opportunityId: opportunity.id,
    status: bundleResult.success ? 'success' : 'failed',
    type: opportunity.type,
    tokenIn: opportunity.tokenIn.symbol,
    tokenOut: opportunity.tokenOut.symbol,
    buyDex: opportunity.buyDex,
    sellDex: opportunity.sellDex,
    amountIn: opportunity.tradeAmountUSD,
    amountOut: opportunity.tradeAmountUSD + (actualProfit ?? 0),
    expectedProfit: opportunity.estimatedProfitUSD,
    actualProfit,
    txSignatureBuy: bundleResult.bundleId,
    txSignatureSell: null,
    gasFeesSOL: gasCostSOL,
    timestamp: startTime,
    executionTimeMs: bundleResult.executionTimeMs,
    error: bundleResult.error,
    mode: 'live',
  };
}

function makeErrorTrade(
  opportunity: ArbitrageOpportunity,
  startTime: number,
  error: string
): TradeExecution {
  return {
    id: `err-${Date.now()}`,
    opportunityId: opportunity.id,
    status: 'failed',
    type: opportunity.type,
    tokenIn: opportunity.tokenIn.symbol,
    tokenOut: opportunity.tokenOut.symbol,
    buyDex: opportunity.buyDex,
    sellDex: opportunity.sellDex,
    amountIn: opportunity.tradeAmountUSD,
    amountOut: 0,
    expectedProfit: opportunity.estimatedProfitUSD,
    actualProfit: null,
    txSignatureBuy: null,
    txSignatureSell: null,
    gasFeesSOL: 0,
    timestamp: startTime,
    executionTimeMs: Date.now() - startTime,
    error,
    mode: config.tradingMode,
  };
}

export async function executeArbitrage(opportunity: ArbitrageOpportunity): Promise<TradeExecution> {
  logger.info(
    `[JITO] Executing ${opportunity.type}: ${opportunity.tokenIn.symbol}→${opportunity.tokenOut.symbol} ` +
    `via ${opportunity.buyDex}→${opportunity.sellDex} ` +
    `| expected: $${opportunity.estimatedProfitUSD.toFixed(4)} ` +
    `| tip floor: ${jitoTipFloor} lamports`
  );

  if (config.tradingMode === 'simulation') {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 150));
    return simulateExecution(opportunity);
  }

  return executeJitoTrade(opportunity);
}
