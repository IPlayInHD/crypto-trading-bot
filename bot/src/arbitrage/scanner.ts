import { ArbitrageOpportunity, TokenInfo } from '../types';
import { config, SCAN_PAIRS, TRIANGULAR_PATHS } from '../config';
import { getJupiterQuote } from '../dex/jupiter';
import { logger } from '../utils/logger';

let solPriceUSD = 150;

export function updateSolPrice(price: number) {
  solPriceUSD = price;
}

export function getSolPrice() {
  return solPriceUSD;
}

function toLamports(amount: number, decimals: number): number {
  return amount * Math.pow(10, decimals);
}

function toUSD(amount: number, token: TokenInfo): number {
  if (token.symbol === 'USDC' || token.symbol === 'USDT') return amount;
  if (token.symbol === 'SOL' || token.symbol === 'mSOL') return amount * solPriceUSD;
  return amount;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function scanCrossDexArbitrage(
  baseToken: TokenInfo,
  quoteToken: TokenInfo,
  tradeAmountUSD: number
): Promise<ArbitrageOpportunity[]> {
  const inputAmountBase =
    baseToken.symbol === 'SOL' || baseToken.symbol === 'mSOL'
      ? tradeAmountUSD / solPriceUSD
      : tradeAmountUSD;

  const inputLamports = toLamports(inputAmountBase, baseToken.decimals);

  const [directQuote, indirectQuote] = await Promise.all([
    getJupiterQuote(baseToken, quoteToken, inputLamports, config.slippageBps),
    getJupiterQuote(
      quoteToken,
      baseToken,
      toLamports(
        quoteToken.symbol === 'USDC' || quoteToken.symbol === 'USDT'
          ? tradeAmountUSD
          : inputAmountBase,
        quoteToken.decimals
      ),
      config.slippageBps
    ),
  ]);

  if (!directQuote || !indirectQuote) return [];

  const outputFromBuy =
    parseInt(directQuote.outputAmount) / Math.pow(10, quoteToken.decimals);
  const outputFromSell =
    parseInt(indirectQuote.outputAmount) / Math.pow(10, baseToken.decimals);

  const profitBase = outputFromSell - inputAmountBase;
  const profitUSD = toUSD(profitBase, baseToken);
  const profitPct = (profitBase / inputAmountBase) * 100;

  if (profitUSD > config.minProfitUSD && profitPct > 0) {
    const confidence: 'low' | 'medium' | 'high' =
      profitPct > 1.0 ? 'high' : profitPct > 0.3 ? 'medium' : 'low';
    return [
      {
        id: generateId(),
        type: 'cross-dex',
        tokenIn: baseToken,
        tokenOut: quoteToken,
        buyDex: directQuote.route[0] || 'Raydium',
        sellDex: indirectQuote.route[0] || 'Orca',
        buyPrice: directQuote.pricePerToken,
        sellPrice: 1 / indirectQuote.pricePerToken,
        priceDiffPct: profitPct,
        estimatedProfitUSD: profitUSD,
        estimatedProfitPct: profitPct,
        tradeAmountUSD,
        buyQuote: directQuote,
        sellQuote: indirectQuote,
        timestamp: Date.now(),
        confidence,
      },
    ];
  }

  return [];
}

async function scanTriangularArbitrage(
  path: TokenInfo[],
  startAmountUSD: number
): Promise<ArbitrageOpportunity[]> {
  if (path.length < 3) return [];

  const [tokenA, tokenB, tokenC] = path;

  const startAmountA =
    tokenA.symbol === 'SOL' || tokenA.symbol === 'mSOL'
      ? startAmountUSD / solPriceUSD
      : startAmountUSD;

  const quoteAB = await getJupiterQuote(
    tokenA, tokenB,
    toLamports(startAmountA, tokenA.decimals),
    config.slippageBps
  );
  if (!quoteAB) return [];

  const amountB = parseInt(quoteAB.outputAmount) / Math.pow(10, tokenB.decimals);

  const quoteBC = await getJupiterQuote(
    tokenB, tokenC,
    toLamports(amountB, tokenB.decimals),
    config.slippageBps
  );
  if (!quoteBC) return [];

  const amountC = parseInt(quoteBC.outputAmount) / Math.pow(10, tokenC.decimals);

  const quoteCA = await getJupiterQuote(
    tokenC, tokenA,
    toLamports(amountC, tokenC.decimals),
    config.slippageBps
  );
  if (!quoteCA) return [];

  const finalAmountA = parseInt(quoteCA.outputAmount) / Math.pow(10, tokenA.decimals);
  const profitA = finalAmountA - startAmountA;
  const profitUSD = toUSD(profitA, tokenA);
  const profitPct = (profitA / startAmountA) * 100;

  if (profitUSD > config.minProfitUSD && profitPct > 0) {
    const confidence: 'low' | 'medium' | 'high' =
      profitPct > 0.8 ? 'high' : profitPct > 0.2 ? 'medium' : 'low';
    return [
      {
        id: generateId(),
        type: 'triangular',
        tokenIn: tokenA,
        tokenOut: tokenA,
        buyDex: quoteAB.route[0] || 'Raydium',
        sellDex: quoteCA.route[0] || 'Orca',
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
      },
    ];
  }

  return [];
}

export async function scanForOpportunities(): Promise<ArbitrageOpportunity[]> {
  const all: ArbitrageOpportunity[] = [];
  const tradeAmountUSD = Math.min(config.maxTradeSizeSOL * solPriceUSD, 500);

  logger.debug(
    `Scanning ${SCAN_PAIRS.length} pairs + ${TRIANGULAR_PATHS.length} triangular paths...`
  );

  const crossDexResults = await Promise.allSettled(
    SCAN_PAIRS.map((pair) => scanCrossDexArbitrage(pair.base, pair.quote, tradeAmountUSD))
  );

  for (const result of crossDexResults) {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    }
  }

  for (const path of TRIANGULAR_PATHS) {
    try {
      const opps = await scanTriangularArbitrage(path, tradeAmountUSD);
      all.push(...opps);
    } catch {
      logger.debug(`Triangular scan failed for ${path.map((t) => t.symbol).join('→')}`);
    }
  }

  return all.sort((a, b) => b.estimatedProfitUSD - a.estimatedProfitUSD);
}
