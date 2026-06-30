import os
from dotenv import load_dotenv

load_dotenv()

# Exchange
BINANCE_API_KEY    = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")

# Mode
PAPER_TRADING   = os.getenv("TRADING_MODE", "paper").lower() == "paper"
INITIAL_BALANCE = float(os.getenv("INITIAL_BALANCE", "50"))

# Universe
QUOTE          = "USDT"
MIN_VOLUME_24H = 5_000_000   # only trade pairs with >$5M daily volume
MAX_PAIRS      = 30

# Risk
MAX_POSITION_PCT  = 0.20   # max 20% of portfolio per position
MAX_POSITIONS     = 4      # max simultaneous open positions
DAILY_LOSS_LIMIT  = 0.05   # halt trading if down 5% on the day
MIN_ORDER_USD     = 11.0   # Binance minimum notional ~$10-15

# Fees & slippage (paper mode simulation)
FEE_RATE  = 0.001   # 0.1% per side
SLIPPAGE  = 0.0005  # 0.05% simulated slippage on fills

# Timeframes
REGIME_TF   = "1h"
SIGNAL_TF   = "5m"
OHLCV_LIMIT = 120

# Grid strategy
GRID_SPREAD = 0.005   # 0.5% between each grid level
GRID_LEVELS = 4       # 2 buy levels below, 2 sell levels above

# Momentum strategy
EMA_FAST        = 9
EMA_SLOW        = 21
RSI_PERIOD      = 14
RSI_BUY_MIN     = 45
RSI_BUY_MAX     = 65
MOMENTUM_SL_ATR = 1.5   # stop loss = 1.5x ATR below entry
MOMENTUM_TP_ATR = 3.0   # take profit = 3x ATR above entry

# Mean reversion strategy
BB_PERIOD    = 20
BB_STD       = 2.0
MR_RSI_ENTRY = 32     # enter long when RSI below this
MR_SL_PCT    = 0.025  # 2.5% hard stop loss

# Loop intervals (seconds)
REGIME_INTERVAL = 300   # re-classify pairs every 5 min
SIGNAL_INTERVAL = 30    # scan for new entries every 30 sec
TICK_INTERVAL   = 5     # main loop cadence
