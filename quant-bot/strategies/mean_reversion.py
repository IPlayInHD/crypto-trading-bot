"""
Mean-reversion strategy.

Entry:  Price touches / breaks below Bollinger lower band AND RSI < 32
Exit:   Price returns to BB middle band (20-period EMA)  OR  2.5% hard stop loss

Activates in RANGING and VOLATILE regimes.
"""

import logging
import uuid
import pandas as pd
import pandas_ta as ta
from dataclasses import dataclass
from typing import Optional, Dict
import config

log = logging.getLogger(__name__)


@dataclass
class MRPosition:
    id:          str
    pair:        str
    entry_price: float
    stop_loss:   float
    target:      float   # BB middle band at entry time
    size_usd:    float
    opened_at:   pd.Timestamp


class MeanReversionStrategy:

    def __init__(self):
        self.positions: Dict[str, MRPosition] = {}

    def check_entry(self, pair: str, df: pd.DataFrame, available_usd: float) -> Optional[dict]:
        if pair in self.positions:
            return None
        if available_usd < config.MIN_ORDER_USD:
            return None
        if df is None or len(df) < config.BB_PERIOD + 5:
            return None

        df  = df.copy()
        bb  = ta.bbands(df["close"], length=config.BB_PERIOD, std=config.BB_STD)
        df["bbl"] = bb[f"BBL_{config.BB_PERIOD}_{config.BB_STD}"]
        df["bbm"] = bb[f"BBM_{config.BB_PERIOD}_{config.BB_STD}"]
        df["rsi"] = ta.rsi(df["close"], length=14)

        last  = df.iloc[-1]
        price = last["close"]
        rsi   = last["rsi"]
        bbl   = last["bbl"]
        bbm   = last["bbm"]

        if pd.isna(bbl) or pd.isna(rsi):
            return None

        # Price at or below lower band AND RSI oversold
        price_at_band = price <= bbl * 1.002   # within 0.2% of lower band
        rsi_oversold  = rsi < config.MR_RSI_ENTRY

        if not (price_at_band and rsi_oversold):
            return None

        sl   = round(price * (1 - config.MR_SL_PCT), 8)
        size = min(available_usd * config.MAX_POSITION_PCT, available_usd * 0.25)
        size = max(size, config.MIN_ORDER_USD)

        signal = {
            "id":         str(uuid.uuid4())[:8],
            "pair":       pair,
            "strategy":   "mean_reversion",
            "side":       "buy",
            "entry":      price,
            "stop_loss":  sl,
            "take_profit": bbm,
            "size_usd":   size,
            "reason":     f"BB lower touch RSI={rsi:.1f} bbl={bbl:.6f}",
        }
        log.info("[MR] Signal %s | entry=%.6f target=%.6f sl=%.6f", pair, price, bbm, sl)
        return signal

    def open_position(self, signal: dict):
        pos = MRPosition(
            id          = signal["id"],
            pair        = signal["pair"],
            entry_price = signal["entry"],
            stop_loss   = signal["stop_loss"],
            target      = signal["take_profit"],
            size_usd    = signal["size_usd"],
            opened_at   = pd.Timestamp.now(),
        )
        self.positions[signal["pair"]] = pos

    def check_exit(self, pair: str, df: pd.DataFrame, current_price: float) -> Optional[dict]:
        if pair not in self.positions:
            return None

        pos = self.positions[pair]

        # Recompute current BB middle
        target = pos.target
        if df is not None and len(df) >= config.BB_PERIOD:
            df  = df.copy()
            bb  = ta.bbands(df["close"], length=config.BB_PERIOD, std=config.BB_STD)
            col = f"BBM_{config.BB_PERIOD}_{config.BB_STD}"
            if col in bb.columns:
                target = bb[col].iloc[-1]

        reason = None
        if current_price <= pos.stop_loss:
            reason = "stop_loss"
        elif current_price >= target:
            reason = "take_profit"

        if reason is None:
            return None

        pnl_pct = (current_price - pos.entry_price) / pos.entry_price
        pnl_usd = pos.size_usd * pnl_pct - pos.size_usd * config.FEE_RATE * 2

        event = {
            "pair":     pair,
            "strategy": "mean_reversion",
            "entry":    pos.entry_price,
            "exit":     current_price,
            "size_usd": pos.size_usd,
            "pnl_usd":  round(pnl_usd, 4),
            "pnl_pct":  round(pnl_pct * 100, 3),
            "reason":   reason,
        }
        del self.positions[pair]
        log.info("[MR] Exit %s | reason=%s pnl=$%.4f (%.2f%%)", pair, reason, pnl_usd, pnl_pct * 100)
        return event
