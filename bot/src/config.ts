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
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '500'),
  enabledDexes: ['Raydium', 'Orca', 'Meteora', 'Lifinity', 'Phoenix', 'Whirlpool'],
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
  WIF: {
    symbol: 'WIF',
    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    decimals: 6,
    name: 'dogwifhat',
  },
  PYTH: {
    symbol: 'PYTH',
    mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    decimals: 6,
    name: 'Pyth Network',
  },
  JITO: {
    symbol: 'JITO',
    mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    decimals: 9,
    name: 'Jito Staked SOL',
  },
  BSOL: {
    symbol: 'bSOL',
    mint: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
    decimals: 9,
    name: 'BlazeStake Staked SOL',
  },
  MSOL: {
    symbol: 'mSOL',
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    decimals: 9,
    name: 'Marinade Staked SOL',
  },
  SAMO: {
    symbol: 'SAMO',
    mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    decimals: 9,
    name: 'Samoyedcoin',
  },
  STEP: {
    symbol: 'STEP',
    mint: 'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT',
    decimals: 9,
    name: 'Step Finance',
  },
  MNGO: {
    symbol: 'MNGO',
    mint: 'MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac',
    decimals: 6,
    name: 'Mango',
  },
  DUST: {
    symbol: 'DUST',
    mint: 'DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ',
    decimals: 9,
    name: 'DUST Protocol',
  },
  MEAN: {
    symbol: 'MEAN',
    mint: 'MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD',
    decimals: 6,
    name: 'Mean DAO',
  },
  SRM: {
    symbol: 'SRM',
    mint: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt',
    decimals: 6,
    name: 'Serum',
  },
  ATLAS: {
    symbol: 'ATLAS',
    mint: 'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx',
    decimals: 8,
    name: 'Star Atlas',
  },
  POLIS: {
    symbol: 'POLIS',
    mint: 'poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk',
    decimals: 8,
    name: 'Star Atlas DAO',
  },
  COPE: {
    symbol: 'COPE',
    mint: '8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh',
    decimals: 6,
    name: 'Cope',
  },
  SLND: {
    symbol: 'SLND',
    mint: 'SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp',
    decimals: 6,
    name: 'Solend',
  },
  PORT: {
    symbol: 'PORT',
    mint: 'PoRTjZMPXb9T7dyU7tpLEZRQj7e6ssfAE62j2oQuc6y',
    decimals: 6,
    name: 'Port Finance',
  },
  RENDER: {
    symbol: 'RENDER',
    mint: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',
    decimals: 8,
    name: 'Render Token',
  },
  HNT: {
    symbol: 'HNT',
    mint: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux',
    decimals: 8,
    name: 'Helium',
  },
  MOBILE: {
    symbol: 'MOBILE',
    mint: 'mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6',
    decimals: 6,
    name: 'Helium Mobile',
  },
  IOT: {
    symbol: 'IOT',
    mint: 'iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns',
    decimals: 6,
    name: 'Helium IOT',
  },
  ZEUS: {
    symbol: 'ZEUS',
    mint: 'ZEUS1aR7aX8DFFkEiMZiATY9muYpTnu36UnmZxHgEGt',
    decimals: 6,
    name: 'Zeus Network',
  },
  POPCAT: {
    symbol: 'POPCAT',
    mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
    decimals: 9,
    name: 'Popcat',
  },
  MEW: {
    symbol: 'MEW',
    mint: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
    decimals: 5,
    name: 'cat in a dogs world',
  },
  TRUMP: {
    symbol: 'TRUMP',
    mint: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
    decimals: 6,
    name: 'Official Trump',
  },
  FARTCOIN: {
    symbol: 'FARTCOIN',
    mint: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump',
    decimals: 6,
    name: 'Fartcoin',
  },
  PENGU: {
    symbol: 'PENGU',
    mint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
    decimals: 6,
    name: 'Pudgy Penguins',
  },
  AI16Z: {
    symbol: 'AI16Z',
    mint: 'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC',
    decimals: 6,
    name: 'ai16z',
  },
};

// Token pairs to scan for arbitrage (expanded from 7 to 30 pairs)
export const SCAN_PAIRS = [
  // SOL pairs
  { base: TOKENS.SOL, quote: TOKENS.USDC },
  { base: TOKENS.SOL, quote: TOKENS.USDT },
  { base: TOKENS.SOL, quote: TOKENS.RAY },
  { base: TOKENS.SOL, quote: TOKENS.BONK },
  { base: TOKENS.SOL, quote: TOKENS.WIF },
  { base: TOKENS.SOL, quote: TOKENS.JUP },
  { base: TOKENS.SOL, quote: TOKENS.PYTH },

  // Stablecoin pairs
  { base: TOKENS.USDC, quote: TOKENS.USDT },

  // Liquid staking pairs (most likely to have gaps)
  { base: TOKENS.mSOL, quote: TOKENS.SOL },
  { base: TOKENS.mSOL, quote: TOKENS.USDC },
  { base: TOKENS.JITO, quote: TOKENS.SOL },
  { base: TOKENS.JITO, quote: TOKENS.USDC },
  { base: TOKENS.BSOL, quote: TOKENS.SOL },
  { base: TOKENS.BSOL, quote: TOKENS.USDC },

  // DeFi token pairs
  { base: TOKENS.RAY, quote: TOKENS.USDC },
  { base: TOKENS.RAY, quote: TOKENS.USDT },
  { base: TOKENS.ORCA, quote: TOKENS.USDC },
  { base: TOKENS.JUP, quote: TOKENS.USDC },
  { base: TOKENS.JUP, quote: TOKENS.USDT },
  { base: TOKENS.PYTH, quote: TOKENS.USDC },

  // Meme token pairs
  { base: TOKENS.BONK, quote: TOKENS.USDC },
  { base: TOKENS.BONK, quote: TOKENS.USDT },
  { base: TOKENS.WIF, quote: TOKENS.USDC },
  { base: TOKENS.WIF, quote: TOKENS.USDT },
  { base: TOKENS.SAMO, quote: TOKENS.USDC },

  // Cross-token pairs
  { base: TOKENS.RAY, quote: TOKENS.SOL },
  { base: TOKENS.ORCA, quote: TOKENS.SOL },
  { base: TOKENS.BONK, quote: TOKENS.SOL },
  { base: TOKENS.WIF, quote: TOKENS.SOL },
  { base: TOKENS.MNGO, quote: TOKENS.USDC },

  // Infrastructure tokens
  { base: TOKENS.RENDER, quote: TOKENS.USDC },
  { base: TOKENS.RENDER, quote: TOKENS.SOL },
  { base: TOKENS.HNT, quote: TOKENS.USDC },
  { base: TOKENS.HNT, quote: TOKENS.SOL },
  { base: TOKENS.MOBILE, quote: TOKENS.USDC },
  { base: TOKENS.IOT, quote: TOKENS.USDC },
  { base: TOKENS.ZEUS, quote: TOKENS.USDC },
  { base: TOKENS.ZEUS, quote: TOKENS.SOL },
  { base: TOKENS.AI16Z, quote: TOKENS.USDC },
  { base: TOKENS.AI16Z, quote: TOKENS.SOL },

  // High volume meme tokens
  { base: TOKENS.POPCAT, quote: TOKENS.USDC },
  { base: TOKENS.POPCAT, quote: TOKENS.SOL },
  { base: TOKENS.MEW, quote: TOKENS.USDC },
  { base: TOKENS.MEW, quote: TOKENS.SOL },
  { base: TOKENS.TRUMP, quote: TOKENS.USDC },
  { base: TOKENS.TRUMP, quote: TOKENS.SOL },
  { base: TOKENS.FARTCOIN, quote: TOKENS.USDC },
  { base: TOKENS.PENGU, quote: TOKENS.USDC },
  { base: TOKENS.PENGU, quote: TOKENS.SOL },
];

// Triangular arbitrage paths (expanded)
export const TRIANGULAR_PATHS = [
  // SOL based
  [TOKENS.SOL, TOKENS.USDC, TOKENS.USDT],
  [TOKENS.SOL, TOKENS.USDC, TOKENS.RAY],
  [TOKENS.SOL, TOKENS.USDT, TOKENS.RAY],
  [TOKENS.SOL, TOKENS.mSOL, TOKENS.USDC],
  [TOKENS.SOL, TOKENS.JITO, TOKENS.USDC],
  [TOKENS.SOL, TOKENS.JUP, TOKENS.USDC],
  [TOKENS.SOL, TOKENS.BONK, TOKENS.USDC],
  [TOKENS.SOL, TOKENS.WIF, TOKENS.USDC],
  [TOKENS.SOL, TOKENS.PYTH, TOKENS.USDC],

  // Liquid staking triangular
  [TOKENS.mSOL, TOKENS.SOL, TOKENS.USDC],
  [TOKENS.JITO, TOKENS.SOL, TOKENS.USDC],
  [TOKENS.BSOL, TOKENS.SOL, TOKENS.USDC],

  // DeFi triangular
  [TOKENS.RAY, TOKENS.USDC, TOKENS.USDT],
  [TOKENS.ORCA, TOKENS.USDC, TOKENS.SOL],
  [TOKENS.JUP, TOKENS.USDC, TOKENS.SOL],

  // Meme triangular
  [TOKENS.WIF, TOKENS.USDC, TOKENS.BONK],
  [TOKENS.POPCAT, TOKENS.USDC, TOKENS.SOL],
  [TOKENS.TRUMP, TOKENS.USDC, TOKENS.SOL],
  [TOKENS.MEW, TOKENS.USDC, TOKENS.SOL],

  // Infrastructure triangular
  [TOKENS.RENDER, TOKENS.USDC, TOKENS.SOL],
  [TOKENS.HNT, TOKENS.USDC, TOKENS.SOL],
  [TOKENS.AI16Z, TOKENS.USDC, TOKENS.SOL],
];
