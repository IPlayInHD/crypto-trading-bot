import axios from 'axios';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { logger } from '../utils/logger';

// Jito block engine endpoints (mainnet)
const JITO_BLOCK_ENGINES = [
  'https://mainnet.block-engine.jito.labs.io',
  'https://amsterdam.mainnet.block-engine.jito.labs.io',
  'https://frankfurt.mainnet.block-engine.jito.labs.io',
  'https://ny.mainnet.block-engine.jito.labs.io',
  'https://tokyo.mainnet.block-engine.jito.labs.io',
];

// Jito tip accounts — send SOL to one of these to prioritize your bundle
const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL1KHK',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

export interface BundleResult {
  success: boolean;
  bundleId: string | null;
  error: string | null;
  tipLamports: number;
  executionTimeMs: number;
}

// Pick a random tip account to distribute load
function getRandomTipAccount(): PublicKey {
  const account = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
  return new PublicKey(account);
}

// Pick fastest block engine (try primary first, fallback to others)
function getBlockEngine(): string {
  return JITO_BLOCK_ENGINES[Math.floor(Math.random() * 3)]; // Use first 3 (fastest)
}

// Calculate dynamic tip based on expected profit
export function calculateJitoTip(expectedProfitUSD: number, solPriceUSD: number): number {
  // Tip = 10% of expected profit, min 10000 lamports (~$0.001), max 1000000 lamports (~$0.10)
  const tipUSD = expectedProfitUSD * 0.10;
  const tipSOL = tipUSD / solPriceUSD;
  const tipLamports = Math.floor(tipSOL * 1e9);
  return Math.min(Math.max(tipLamports, 10_000), 1_000_000);
}

// Calculate optimal compute unit price based on network conditions
export async function getOptimalComputeUnitPrice(connection: Connection): Promise<number> {
  try {
    const recentFees = await connection.getRecentPrioritizationFees();
    if (recentFees.length === 0) return 50_000; // Default 50k microlamports

    // Use 75th percentile of recent fees for competitive priority
    const sorted = recentFees
      .map((f) => f.prioritizationFee)
      .sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    return Math.max(p75 * 1.2, 50_000); // 20% above p75, min 50k
  } catch {
    return 50_000;
  }
}

// Add priority fee instructions to a transaction
export function addPriorityFees(
  transaction: VersionedTransaction,
  computeUnitPrice: number,
  computeUnitLimit: number = 200_000
): VersionedTransaction {
  // We can't easily modify VersionedTransactions after creation from Jupiter
  // Priority fees are handled via Jupiter's dynamicComputeUnitLimit + prioritizationFeeLamports
  return transaction;
}

// Create a tip transaction to send to Jito
async function createTipTransaction(
  connection: Connection,
  wallet: Keypair,
  tipLamports: number
): Promise<VersionedTransaction> {
  const tipAccount = getRandomTipAccount();
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const tipIx = SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: tipAccount,
    lamports: tipLamports,
  });

  // Add compute budget for the tip tx
  const cuPriceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 });
  const cuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000 });

  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [cuPriceIx, cuLimitIx, tipIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([wallet]);
  return tx;
}

// Submit a bundle of transactions to Jito
export async function submitJitoBundle(
  connection: Connection,
  wallet: Keypair,
  swapTransaction: VersionedTransaction,
  tipLamports: number
): Promise<BundleResult> {
  const startTime = Date.now();

  try {
    // Create tip transaction
    const tipTx = await createTipTransaction(connection, wallet, tipLamports);

    // Serialize both transactions
    const encodedSwap = bs58.encode(swapTransaction.serialize());
    const encodedTip = bs58.encode(tipTx.serialize());

    const blockEngine = getBlockEngine();

    // Submit bundle to Jito
    const response = await axios.post(
      `${blockEngine}/api/v1/bundles`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [[encodedSwap, encodedTip]],
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000,
      }
    );

    const bundleId = response.data?.result;

    if (!bundleId) {
      throw new Error(`No bundle ID returned: ${JSON.stringify(response.data)}`);
    }

    logger.info(`Jito bundle submitted: ${bundleId} (tip: ${tipLamports} lamports)`);

    // Poll for bundle status
    const confirmed = await waitForBundleConfirmation(blockEngine, bundleId);

    return {
      success: confirmed,
      bundleId,
      error: confirmed ? null : 'Bundle not confirmed within timeout',
      tipLamports,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Jito bundle failed: ${message}`);
    return {
      success: false,
      bundleId: null,
      error: message,
      tipLamports,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// Poll Jito for bundle confirmation
async function waitForBundleConfirmation(
  blockEngine: string,
  bundleId: string,
  maxWaitMs: number = 15_000
): Promise<boolean> {
  const start = Date.now();
  const pollInterval = 1000;

  while (Date.now() - start < maxWaitMs) {
    try {
      const response = await axios.post(
        `${blockEngine}/api/v1/bundles`,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getBundleStatuses',
          params: [[bundleId]],
        },
        { timeout: 5000 }
      );

      const statuses = response.data?.result?.value;
      if (statuses && statuses.length > 0) {
        const status = statuses[0]?.confirmation_status;
        if (status === 'confirmed' || status === 'finalized') {
          logger.info(`Bundle ${bundleId} confirmed in ${Date.now() - start}ms`);
          return true;
        }
        if (statuses[0]?.err) {
          logger.warn(`Bundle ${bundleId} failed: ${JSON.stringify(statuses[0].err)}`);
          return false;
        }
      }
    } catch {
      // Poll errors are non-fatal, keep waiting
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  logger.warn(`Bundle ${bundleId} confirmation timeout after ${maxWaitMs}ms`);
  return false;
}

// Get current Jito tip floor from the API
export async function getJitoTipFloor(): Promise<number> {
  try {
    const response = await axios.get(
      'https://bundles.jito.wtf/api/v1/bundles/tip_floor',
      { timeout: 3000 }
    );
    const floor = response.data?.[0]?.landed_tips_50th_percentile;
    return floor ? Math.floor(floor * 1e9) : 10_000;
  } catch {
    return 10_000; // Default 10k lamports
  }
}
