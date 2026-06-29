# Solana Arbitrage Trading Bot

Automated DEX arbitrage trading bot for the Solana blockchain with a real-time React dashboard.

## Features

- **Automated Arbitrage Detection**: Scans multiple Solana DEXes (Raydium, Orca, Meteora, Lifinity, Phoenix) for price discrepancies
- **Two Arbitrage Strategies**:
  - **Cross-DEX**: Buy on cheaper DEX, sell on expensive DEX
  - **Triangular**: Exploit price loops across 3 token pairs (e.g., SOL → USDC → USDT → SOL)
- **Jupiter Aggregator**: Uses Jupiter's routing to get best prices across all DEXes
- **Real-time Dashboard**: React frontend showing live stats, trade history, profit charts, and opportunity feed
- **Simulation Mode**: Test safely without real funds before going live

## Architecture

```
crypto-trading-bot/
├── bot/                    # Node.js/TypeScript trading bot
│   └── src/
│       ├── index.ts        # Main loop
│       ├── config.ts       # Tokens, pairs, settings
│       ├── dex/
│       │   └── jupiter.ts  # Jupiter API integration
│       ├── arbitrage/
│       │   ├── scanner.ts  # Opportunity detection
│       │   └── executor.ts # Trade execution
│       └── server/
│           └── websocket.ts # Dashboard WebSocket server
└── dashboard/              # React + Tailwind dashboard
    └── src/
        ├── App.tsx
        ├── components/     # StatCard, Charts, TradeHistory, etc.
        └── hooks/
            └── useWebSocket.ts
```

## Quick Start

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Configure the Bot

```bash
npm run setup
# Then edit bot/.env
```

Key settings in `bot/.env`:
```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com   # Use a private RPC for production
WALLET_PRIVATE_KEY=your_base58_private_key           # Your Solana wallet
TRADING_MODE=simulation                              # Start with simulation!
MIN_PROFIT_USD=0.10                                  # Min profit to execute
MAX_TRADE_SIZE_SOL=1.0                               # Max position size
SCAN_INTERVAL_MS=2000                                # Scan every 2 seconds
```

### 3. Run

In two terminals:

```bash
# Terminal 1: Start the bot
npm run dev:bot

# Terminal 2: Start the dashboard
npm run dev:dashboard
```

Then open **http://localhost:3000** to view the dashboard.

## Trading Modes

| Mode | Description |
|------|-------------|
| `simulation` | Scans real prices, simulates execution without spending funds |
| `live` | Executes real trades — requires funded wallet |

**Always start in simulation mode** to verify profitability before going live.

## Dashboard Features

- **Live price ticker** — SOL, USDC, RAY, JUP, BONK prices
- **Stats panel** — net profit, win rate, trades executed, best trade
- **Cumulative profit chart** — visual profit over time
- **Live opportunity feed** — real-time arbitrage opportunities with confidence scores
- **Trade history** — every trade with status, profit, and Solscan links
- **DEX breakdown chart** — which DEXes are generating most activity
- **Bot status panel** — connection status, uptime, wallet balance
- **Log console** — real-time bot logs streamed to browser

## Token Pairs Monitored

- SOL/USDC, SOL/USDT, USDC/USDT
- RAY/USDC, mSOL/SOL, JUP/USDC, BONK/USDC

## Important Notes

- Use a **private RPC endpoint** (Helius, QuickNode, Alchemy) for production — public RPCs rate-limit aggressively
- Solana arbitrage is highly competitive; most profits are captured by MEV bots
- Transaction fees on Solana are ~0.000005 SOL (~$0.001) but may need priority fees
- Set `MIN_PROFIT_USD` high enough to cover gas + slippage
- The bot uses Jupiter's API which has rate limits on the free tier

## Security

- Never commit `bot/.env` — it contains your private key
- Use a dedicated trading wallet, never your main wallet
- Start with small position sizes (`MAX_TRADE_SIZE_SOL=0.1`)
