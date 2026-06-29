import axios from 'axios';
import { PriceQuote, TokenInfo } from '../types';
import { logger } from '../utils/logger';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

export async function getJupiterQuote(
  inputToken: TokenInfo,
  outputToken: TokenInfo,
  amountLamports: number,
  slippageBps: number = 50
): Promise<PriceQuote | null> {
  try {
    const response = await axios.get<JupiterQuoteResponse>(`${JUPITER_QUOTE_API}/quote`, {
      params: {
        inputMint: inputToken.mint,
        outputMint: outputToken.mint,
        amount: Math.floor(amountLamports),
        slippageBps,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      },
      timeout: 5000,
    });

    const quote = response.data;
    const inputAmount = parseInt(quote.inAmount) / Math.pow(10, inputToken.decimals);
    const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputToken.decimals);
    const pricePerToken = outputAmount / inputAmount;

    // Aggregate fees from route
    const totalFee = quote.routePlan.reduce((acc, step) => {
      return acc + parseInt(step.swapInfo.feeAmount) / Math.pow(10, outputToken.decimals);
    }, 0);

    const dexLabels = quote.routePlan.map((r) => r.swapInfo.label).filter((v, i, a) => a.indexOf(v) === i);

    return {
      dex: dexLabels.join('+') || 'Jupiter',
      inputMint: inputToken.mint,
      outputMint: outputToken.mint,
      inputAmount: quote.inAmount,
      outputAmount: quote.outAmount,
      pricePerToken,
      fee: totalFee,
      priceImpact: parseFloat(quote.priceImpactPct),
      route: dexLabels,
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      logger.debug(`Jupiter quote failed for ${inputToken.symbol}→${outputToken.symbol}: ${err.message}`);
    }
    return null;
  }
}

// Get quotes from specific DEXes by filtering Jupiter routes
export async function getQuoteForDex(
  inputToken: TokenInfo,
  outputToken: TokenInfo,
  amountLamports: number,
  dexLabel: string,
  slippageBps: number = 50
): Promise<PriceQuote | null> {
  try {
    // Use directRoutesOnly to get single-hop routes
    const response = await axios.get<JupiterQuoteResponse>(`${JUPITER_QUOTE_API}/quote`, {
      params: {
        inputMint: inputToken.mint,
        outputMint: outputToken.mint,
        amount: Math.floor(amountLamports),
        slippageBps,
        onlyDirectRoutes: true,
        asLegacyTransaction: false,
      },
      timeout: 5000,
    });

    const quote = response.data;

    // Filter to get quote for specific DEX
    const dexRoute = quote.routePlan.find(
      (r) => r.swapInfo.label.toLowerCase().includes(dexLabel.toLowerCase())
    );

    if (!dexRoute && quote.routePlan.length > 0) {
      // Return whatever route Jupiter found
      const inputAmount = parseInt(quote.inAmount) / Math.pow(10, inputToken.decimals);
      const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputToken.decimals);

      return {
        dex: quote.routePlan[0].swapInfo.label,
        inputMint: inputToken.mint,
        outputMint: outputToken.mint,
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        pricePerToken: outputAmount / inputAmount,
        fee: parseInt(quote.routePlan[0].swapInfo.feeAmount) / Math.pow(10, outputToken.decimals),
        priceImpact: parseFloat(quote.priceImpactPct),
        route: [quote.routePlan[0].swapInfo.label],
        timestamp: Date.now(),
      };
    }

    if (!dexRoute) return null;

    const inputAmount = parseInt(dexRoute.swapInfo.inAmount) / Math.pow(10, inputToken.decimals);
    const outputAmount = parseInt(dexRoute.swapInfo.outAmount) / Math.pow(10, outputToken.decimals);

    return {
      dex: dexRoute.swapInfo.label,
      inputMint: inputToken.mint,
      outputMint: outputToken.mint,
      inputAmount: dexRoute.swapInfo.inAmount,
      outputAmount: dexRoute.swapInfo.outAmount,
      pricePerToken: outputAmount / inputAmount,
      fee: parseInt(dexRoute.swapInfo.feeAmount) / Math.pow(10, outputToken.decimals),
      priceImpact: parseFloat(quote.priceImpactPct),
      route: [dexRoute.swapInfo.label],
      timestamp: Date.now(),
    };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      logger.debug(`Jupiter DEX-specific quote failed: ${err.message}`);
    }
    return null;
  }
}

// Fetch swap transaction for execution
export async function getSwapTransaction(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: string
): Promise<string | null> {
  try {
    const response = await axios.post(
      `${JUPITER_QUOTE_API}/swap`,
      {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      },
      { timeout: 10000 }
    );
    return response.data.swapTransaction;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      logger.error(`Failed to get swap transaction: ${err.message}`);
    }
    return null;
  }
}
