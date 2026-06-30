import dotenv from 'dotenv';
import { Config } from './types';

dotenv.config();

export const config: Config = {
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY || '',
  tradingMode: (process.env.TRADING_MODE as 'simulation' | 'live') || 'simulation',
  minProfitUSD: parseFloat(process.env.MIN_PROFIT_USD || '0.001'),
  maxTradeSizeSOL: parseFloat(process.env.MAX_TRADE_SIZE_SOL || '0.5'),
  slippageBps: parseInt(process.env.SLIPPAGE_BPS || '50'),
  wsPort: parseInt(process.env.WS_PORT || '8080'),
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '1000'),
  enabledDexes: ['Raydium', 'Orca', 'Meteora', 'Lifinity', 'Phoenix'],
};

// Well-known Solana token mints
export const TOKENS = {
  SOL: {
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    name: 'Solana',
  },
  USDC: {
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    name: 'USD Coin',
  },
  USDT: {
    symbol: 'USDT',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    name: 'Tether USD',
  },
  RAY: {
    symbol: 'RAY',
    mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    decimals: 6,
    name: 'Raydium',
  },
  ORCA: {
    symbol: 'ORCA',
    mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
    decimals: 6,
    name: 'Orca',
  },
  mSOL: {
    symbol: 'mSOL',
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    decimals: 9,
    name: 'Marinade staked SOL',
  },
  JUP: {
    symbol: 'JUP',
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    decimals: 6,
    name: 'Jupiter',
  },
  BONK: {
    symbol: 'BONK',
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    decimals: 5,
    name: 'Bonk',
  },
};

// Token pairs to scan for arbitrage
export const SCAN_PAIRS = [
  { base: TOKENS.SOL, quote: TOKENS.USDC },
  { base: TOKENS.SOL, quote: TOKENS.USDT },
  { base: TOKENS.USDC, quote: TOKENS.USDT },
  { base: TOKENS.RAY, quote: TOKENS.USDC },
  { base: TOKENS.mSOL, quote: TOKENS.SOL },
  { base: TOKENS.JUP, quote: TOKENS.USDC },
  { base: TOKENS.BONK, quote: TOKENS.USDC },
];

// Triangular arbitrage paths
export const TRIANGULAR_PATHS = [
  [TOKENS.SOL, TOKENS.USDC, TOKENS.USDT],
  [TOKENS.SOL, TOKENS.USDC, TOKENS.RAY],
  [TOKENS.SOL, TOKENS.mSOL, TOKENS.USDC],
  [TOKENS.SOL, TOKENS.JUP, TOKENS.USDC],
];
