export interface TokenInfo {
  symbol: string;
  mint: string;
  decimals: number;
  name: string;
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

export interface PriceUpdate {
  pair: string;
  dex: string;
  price: number;
  change24h: number;
  volume24h: number;
  timestamp: number;
}

export interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
}

export interface WsMessage {
  type: 'stats' | 'opportunity' | 'trade' | 'price_update' | 'bot_status' | 'log' | 'pong';
  payload: unknown;
  timestamp: number;
}
