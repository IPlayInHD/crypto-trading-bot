export interface TokenInfo {
  symbol: string;
  mint: string;
  decimals: number;
  name: string;
}

export interface PriceQuote {
  dex: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  pricePerToken: number;
  fee: number;
  priceImpact: number;
  route: string[];
  timestamp: number;
}

export interface ArbitrageOpportunity {
  id: string;
  type: 'cross-dex' | 'triangular';
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  priceDiffPct: number;
  estimatedProfitUSD: number;
  estimatedProfitPct: number;
  tradeAmountUSD: number;
  buyQuote: PriceQuote;
  sellQuote: PriceQuote;
  timestamp: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface TradeExecution {
  id: string;
  opportunityId: string;
  status: 'pending' | 'executing' | 'success' | 'failed' | 'skipped';
  type: 'cross-dex' | 'triangular';
  tokenIn: string;
  tokenOut: string;
  buyDex: string;
  sellDex: string;
  amountIn: number;
  amountOut: number;
  expectedProfit: number;
  actualProfit: number | null;
  txSignatureBuy: string | null;
  txSignatureSell: string | null;
  gasFeesSOL: number;
  timestamp: number;
  executionTimeMs: number;
  error: string | null;
  mode: 'simulation' | 'live';
}

export interface BotStats {
  isRunning: boolean;
  mode: 'simulation' | 'live';
  startTime: number;
  totalScans: number;
  opportunitiesFound: number;
  tradesExecuted: number;
  tradesSuccessful: number;
  tradesFailed: number;
  totalProfitUSD: number;
  totalFeesUSD: number;
  netProfitUSD: number;
  winRate: number;
  avgProfitPerTrade: number;
  bestTrade: number;
  walletBalanceSOL: number;
  walletBalanceUSD: number;
  scanIntervalMs: number;
  lastScanTime: number;
}

export interface WsMessage {
  type:
    | 'stats'
    | 'opportunity'
    | 'trade'
    | 'price_update'
    | 'bot_status'
    | 'log';
  payload: unknown;
  timestamp: number;
}

export interface PriceUpdate {
  pair: string;
  dex: string;
  price: number;
  change24h: number;
  volume24h: number;
  timestamp: number;
}

export interface Config {
  rpcUrl: string;
  walletPrivateKey: string;
  tradingMode: 'simulation' | 'live';
  minProfitUSD: number;
  maxTradeSizeSOL: number;
  slippageBps: number;
  wsPort: number;
  scanIntervalMs: number;
  enabledDexes: string[];
}
