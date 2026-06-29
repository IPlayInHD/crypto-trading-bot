import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import axios from 'axios';
import { ArbitrageOpportunity, TradeExecution } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

let connection: Connection | null = null;
let wallet: Keypair | null = null;

export function initializeExecutor() {
  connection = new Connection(config.rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 30000,
  });

  if (config.walletPrivateKey && config.walletPrivateKey !== 'your_private_key_here') {
    try {
      const decoded = bs58.decode(config.walletPrivateKey);
      wallet = Keypair.fromSecretKey(decoded);
      logger.info(`Wallet initialized: ${wallet.publicKey.toString()}`);
    } catch {
      logger.warn('Invalid wallet private key, running in simulation-only mode');
    }
  } else {
    logger.info('No wallet configured, running in simulation mode');
  }

  return { connection, wallet };
}

export async function getWalletBalance(): Promise<number> {
  if (!connection || !wallet) return 0;
  try {
    const balance = await connection.getBalance(wallet.publicKey);
    return balance / 1e9; // Convert lamports to SOL
  } catch {
    return 0;
  }
}

// Simulate a trade execution (for testing without real funds)
function simulateExecution(opportunity: ArbitrageOpportunity): TradeExecution {
  const startTime = Date.now();

  // Simulate network latency and execution time
  const executionTimeMs = 150 + Math.random() * 300;

  // Add some randomness to actual profit (slippage, fees)
  const slippageFactor = 1 - (Math.random() * 0.003); // 0-0.3% slippage
  const gasFeeSOL = 0.000005 + Math.random() * 0.00001;
  const gasFeeUSD = gasFeeSOL * 150; // Approx SOL price

  // Simulate occasional failures (2% failure rate)
  const isFailure = Math.random() < 0.02;

  const actualProfit = isFailure
    ? 0
    : opportunity.estimatedProfitUSD * slippageFactor - gasFeeUSD;

  return {
    id: `sim-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    opportunityId: opportunity.id,
    status: isFailure ? 'failed' : 'success',
    type: opportunity.type,
    tokenIn: opportunity.tokenIn.symbol,
    tokenOut: opportunity.tokenOut.symbol,
    buyDex: opportunity.buyDex,
    sellDex: opportunity.sellDex,
    amountIn: opportunity.tradeAmountUSD,
    amountOut: opportunity.tradeAmountUSD + actualProfit,
    expectedProfit: opportunity.estimatedProfitUSD,
    actualProfit: isFailure ? null : actualProfit,
    txSignatureBuy: isFailure ? null : `sim_${Math.random().toString(36).substr(2, 44)}`,
    txSignatureSell: isFailure ? null : `sim_${Math.random().toString(36).substr(2, 44)}`,
    gasFeesSOL: gasFeeSOL,
    timestamp: startTime,
    executionTimeMs,
    error: isFailure ? 'Simulated: Transaction failed due to price movement' : null,
    mode: 'simulation',
  };
}

// Execute a real trade via Jupiter
async function executeLiveTrade(opportunity: ArbitrageOpportunity): Promise<TradeExecution> {
  const startTime = Date.now();

  if (!connection || !wallet) {
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
      executionTimeMs: 0,
      error: 'Wallet not initialized',
      mode: 'live',
    };
  }

  let txSignatureBuy: string | null = null;

  try {
    // Get fresh quote
    const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: {
        inputMint: opportunity.tokenIn.mint,
        outputMint: opportunity.tokenOut.mint,
        amount: opportunity.buyQuote.inputAmount,
        slippageBps: config.slippageBps,
      },
      timeout: 5000,
    });

    // Get swap transaction
    const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
      quoteResponse: quoteResponse.data,
      userPublicKey: wallet.publicKey.toString(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    });

    const { swapTransaction } = swapResponse.data;

    // Deserialize and sign
    const transactionBuffer = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);
    transaction.sign([wallet]);

    // Send transaction
    txSignatureBuy = await connection.sendTransaction(transaction, {
      maxRetries: 2,
      skipPreflight: false,
    });

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(txSignatureBuy, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    const executionTimeMs = Date.now() - startTime;
    const gasFeeSOL = 0.000005;

    return {
      id: `live-${Date.now()}`,
      opportunityId: opportunity.id,
      status: 'success',
      type: opportunity.type,
      tokenIn: opportunity.tokenIn.symbol,
      tokenOut: opportunity.tokenOut.symbol,
      buyDex: opportunity.buyDex,
      sellDex: opportunity.sellDex,
      amountIn: opportunity.tradeAmountUSD,
      amountOut: opportunity.tradeAmountUSD + opportunity.estimatedProfitUSD,
      expectedProfit: opportunity.estimatedProfitUSD,
      actualProfit: opportunity.estimatedProfitUSD * 0.95, // Approximate after fees
      txSignatureBuy,
      txSignatureSell: null, // Jupiter handles routing in one tx
      gasFeesSOL: gasFeeSOL,
      timestamp: startTime,
      executionTimeMs,
      error: null,
      mode: 'live',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Trade execution failed: ${message}`);

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
      txSignatureBuy,
      txSignatureSell: null,
      gasFeesSOL: 0,
      timestamp: startTime,
      executionTimeMs: Date.now() - startTime,
      error: message,
      mode: 'live',
    };
  }
}

export async function executeArbitrage(opportunity: ArbitrageOpportunity): Promise<TradeExecution> {
  logger.info(
    `Executing ${opportunity.type} arbitrage: ${opportunity.tokenIn.symbol}→${opportunity.tokenOut.symbol} ` +
    `via ${opportunity.buyDex}→${opportunity.sellDex} ` +
    `(expected profit: $${opportunity.estimatedProfitUSD.toFixed(4)})`
  );

  if (config.tradingMode === 'simulation') {
    // Add realistic delay for simulation
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400));
    return simulateExecution(opportunity);
  }

  return executeLiveTrade(opportunity);
}
