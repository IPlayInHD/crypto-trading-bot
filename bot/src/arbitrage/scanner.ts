import { ArbitrageOpportunity, PriceQuote, TokenInfo } from '../types';
import { config, SCAN_PAIRS, TOKENS, TRIANGULAR_PATHS } from '../config';
import { getJupiterQuote } from '../dex/jupiter';
import { logger } from '../utils/logger';

// Current SOL price in USD (updated periodically)
let solPriceUSD = 150;

export function updateSolPrice(price: number) {
  solPriceUSD = price;
}

export function getSolPrice() {
  return solPriceUSD;
}

// Convert lamports to SOL amount
function toLamports(amount: number, decimals: number): number {
  return amount * Math.pow(10, decimals);
}

// Calculate USD value
function toUSD(amount: number, token: TokenInfo): number {
  if (token.symbol === 'USDC' || token.symbol === 'USDT') return amount;
  if (token.symbol === 'SOL' || token.symbol === 'mSOL') return amount * solPriceUSD;
  return amount; // Fallback
}

// Generate unique ID without uuid dependency
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function scanCrossDexArbitrage(
  baseToken: TokenInfo,
  quoteToken: TokenInfo,
  tradeAmountUSD: number
): Promise<ArbitrageOpportunity[]> {
  const opportunities: ArbitrageOpportunity[] = [];

  // Calculate input amount in token units
  const inputAmountBase = baseToken.symbol === 'SOL' || baseToken.symbol === 'mSOL'
    ? tradeAmountUSD / solPriceUSD
    : tradeAmountUSD;

  const inputLamports = toLamports(inputAmountBase, baseToken.decimals);

  // Fetch quotes from Jupiter for different route configurations
  const [directQuote, indirectQuote] = await Promise.all([
    getJupiterQuote(baseToken, quoteToken, inputLamports, config.slippageBps),
    getJupiterQuote(quoteToken, baseToken, toLamports(
      quoteToken.symbol === 'USDC' || quoteToken.symbol === 'USDT' ? tradeAmountUSD : inputAmountBase,
      quoteToken.decimals
    ), config.slippageBps),
  ]);

  if (!directQuote || !indirectQuote) return opportunities;

  // For cross-dex: compare best buy vs sell price
  const buyPrice = directQuote.pricePerToken; // base → quote price
  const sellback = indirectQuote.pricePerToken; // quote → base price (inverse)

  // If we buy X base for Y quote, then sell Y quote for Z base
  // Profit = Z - X (in base token units)
  const outputFromBuy = parseInt(directQuote.outputAmount) / Math.pow(10, quoteToken.decimals);
  const outputFromSell = parseInt(indirectQuote.outputAmount) / Math.pow(10, baseToken.decimals);

  const profitBase = outputFromSell - inputAmountBase;
  const profitUSD = toUSD(profitBase, baseToken);
  const profitPct = (profitBase / inputAmountBase) * 100;

  // Only count if routes differ (different DEXes found)
  const buyDex = directQuote.route[0] || 'Jupiter';
  const sellDex = indirectQuote.route[0] || 'Jupiter';

  if (buyDex !== sellDex && profitUSD > config.minProfitUSD && profitPct > 0.05) {
    const confidence = profitPct > 1.0 ? 'high' : profitPct > 0.3 ? 'medium' : 'low';

    opportunities.push({
      id: generateId(),
      type: 'cross-dex',
      tokenIn: baseToken,
      tokenOut: quoteToken,
      buyDex,
      sellDex,
      buyPrice,
      sellPrice: 1 / indirectQuote.pricePerToken,
      priceDiffPct: profitPct,
      estimatedProfitUSD: profitUSD,
      estimatedProfitPct: profitPct,
      tradeAmountUSD,
      buyQuote: directQuote,
      sellQuote: indirectQuote,
      timestamp: Date.now(),
      confidence,
    });
  }

  return opportunities;
}

async function scanTriangularArbitrage(
  path: TokenInfo[],
  startAmountUSD: number
): Promise<ArbitrageOpportunity[]> {
  const opportunities: ArbitrageOpportunity[] = [];
  if (path.length < 3) return opportunities;

  const [tokenA, tokenB, tokenC] = path;

  // Start amount in token A
  const startAmountA = tokenA.symbol === 'SOL' || tokenA.symbol === 'mSOL'
    ? startAmountUSD / solPriceUSD
    : startAmountUSD;

  // Step 1: A → B
  const quoteAB = await getJupiterQuote(
    tokenA, tokenB,
    toLamports(startAmountA, tokenA.decimals),
    config.slippageBps
  );
  if (!quoteAB) return opportunities;

  const amountB = parseInt(quoteAB.outputAmount) / Math.pow(10, tokenB.decimals);

  // Step 2: B → C
  const quoteBC = await getJupiterQuote(
    tokenB, tokenC,
    toLamports(amountB, tokenB.decimals),
    config.slippageBps
  );
  if (!quoteBC) return opportunities;

  const amountC = parseInt(quoteBC.outputAmount) / Math.pow(10, tokenC.decimals);

  // Step 3: C → A
  const quoteCA = await getJupiterQuote(
    tokenC, tokenA,
    toLamports(amountC, tokenC.decimals),
    config.slippageBps
  );
  if (!quoteCA) return opportunities;

  const finalAmountA = parseInt(quoteCA.outputAmount) / Math.pow(10, tokenA.decimals);
  const profitA = finalAmountA - startAmountA;
  const profitUSD = toUSD(profitA, tokenA);
  const profitPct = (profitA / startAmountA) * 100;

  if (profitUSD > config.minProfitUSD && profitPct > 0.05) {
    const confidence = profitPct > 0.8 ? 'high' : profitPct > 0.2 ? 'medium' : 'low';

    opportunities.push({
      id: generateId(),
      type: 'triangular',
      tokenIn: tokenA,
      tokenOut: tokenA,
      buyDex: quoteAB.route[0] || 'Jupiter',
      sellDex: quoteCA.route[0] || 'Jupiter',
      buyPrice: parseInt(quoteAB.outputAmount) / parseInt(quoteAB.inputAmount),
      sellPrice: parseInt(quoteCA.outputAmount) / parseInt(quoteCA.inputAmount),
      priceDiffPct: profitPct,
      estimatedProfitUSD: profitUSD,
      estimatedProfitPct: profitPct,
      tradeAmountUSD: startAmountUSD,
      buyQuote: quoteAB,
      sellQuote: quoteCA,
      timestamp: Date.now(),
      confidence,
    });
  }

  return opportunities;
}

export async function scanForOpportunities(): Promise<ArbitrageOpportunity[]> {
  const all: ArbitrageOpportunity[] = [];
  const tradeAmountUSD = Math.min(
    config.maxTradeSizeSOL * solPriceUSD,
    500 // Cap at $500 per scan
  );

  logger.debug(`Scanning ${SCAN_PAIRS.length} pairs + ${TRIANGULAR_PATHS.length} triangular paths...`);

  // Parallel cross-DEX scans
  const crossDexResults = await Promise.allSettled(
    SCAN_PAIRS.map((pair) => scanCrossDexArbitrage(pair.base, pair.quote, tradeAmountUSD))
  );

  for (const result of crossDexResults) {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    }
  }

  // Triangular scans (sequential to avoid rate limits)
  for (const path of TRIANGULAR_PATHS) {
    try {
      const opps = await scanTriangularArbitrage(path, tradeAmountUSD);
      all.push(...opps);
    } catch (err) {
      logger.debug(`Triangular scan failed for ${path.map((t) => t.symbol).join('→')}`);
    }
  }

  // Sort by estimated profit descending
  return all.sort((a, b) => b.estimatedProfitUSD - a.estimatedProfitUSD);
}
