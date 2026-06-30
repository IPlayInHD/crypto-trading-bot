"""
Momentum / trend-following strategy.

Entry:  EMA9 crosses above EMA21 AND RSI between 45-65 (not overbought)
Exit:   Take profit at 3x ATR above entry  OR  stop loss at 1.5x ATR below entry
        OR EMA9 crosses back below EMA21

Only fires in TRENDING_UP regime.
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
class MomentumPosition:
    id:          str
    pair:        str
    entry_price: float
    stop_loss:   float
    take_profit: float
    size_usd:    float
    opened_at:   pd.Timestamp


class MomentumStrategy:

    def __init__(self):
        self.positions: Dict[str, MomentumPosition] = {}   # pair → position

    # ------------------------------------------------------------------
    def check_entry(self, pair: str, df: pd.DataFrame, available_usd: float) -> Optional[dict]:
        """Return entry signal dict or None."""
        if pair in self.positions:
            return None   # already in trade
        if available_usd < config.MIN_ORDER_USD:
            return None
        if df is None or len(df) < config.EMA_SLOW + 5:
            return None

        df = df.copy()
        df["ema_fast"] = ta.ema(df["close"], length=config.EMA_FAST)
        df["ema_slow"] = ta.ema(df["close"], length=config.EMA_SLOW)
        df["rsi"]      = ta.rsi(df["close"], length=config.RSI_PERIOD)

        atr_df = ta.atr(df["high"], df["low"], df["close"], length=14)
        df["atr"] = atr_df

        prev = df.iloc[-2]
        last = df.iloc[-1]

        # EMA crossover (fast crosses above slow)
        crossed_up = prev["ema_fast"] <= prev["ema_slow"] and last["ema_fast"] > last["ema_slow"]
        # RSI in healthy momentum zone
        rsi_ok = config.RSI_BUY_MIN <= last["rsi"] <= config.RSI_BUY_MAX

        if not (crossed_up and rsi_ok):
            return None

        atr   = last["atr"]
        price = last["close"]
        sl    = round(price - config.MOMENTUM_SL_ATR * atr, 8)
        tp    = round(price + config.MOMENTUM_TP_ATR * atr, 8)
        size  = min(available_usd * config.MAX_POSITION_PCT, available_usd * 0.25)
        size  = max(size, config.MIN_ORDER_USD)

        signal = {
            "id":         str(uuid.uuid4())[:8],
            "pair":       pair,
            "strategy":   "momentum",
            "side":       "buy",
            "entry":      price,
            "stop_loss":  sl,
            "take_profit": tp,
            "size_usd":   size,
            "reason":     f"EMA{config.EMA_FAST}x{config.EMA_SLOW} crossup RSI={last['rsi']:.1f}",
        }
        log.info("[MOM] Signal %s | entry=%.6f sl=%.6f tp=%.6f", pair, price, sl, tp)
        return signal

    def open_position(self, signal: dict):
        pos = MomentumPosition(
            id          = signal["id"],
            pair        = signal["pair"],
            entry_price = signal["entry"],
            stop_loss   = signal["stop_loss"],
            take_profit = signal["take_profit"],
            size_usd    = signal["size_usd"],
            opened_at   = pd.Timestamp.now(),
        )
        self.positions[signal["pair"]] = pos

    def check_exit(self, pair: str, df: pd.DataFrame, current_price: float) -> Optional[dict]:
        """Return exit event dict or None."""
        if pair not in self.positions:
            return None

        pos    = self.positions[pair]
        reason = None

        if current_price <= pos.stop_loss:
            reason = "stop_loss"
        elif current_price >= pos.take_profit:
            reason = "take_profit"
        else:
            # Check EMA cross reversal
            if df is not None and len(df) >= config.EMA_SLOW + 2:
                df         = df.copy()
                df["ef"]   = ta.ema(df["close"], length=config.EMA_FAST)
                df["es"]   = ta.ema(df["close"], length=config.EMA_SLOW)
                if df.iloc[-1]["ef"] < df.iloc[-1]["es"]:
                    reason = "ema_reversal"

        if reason is None:
            return None

        pnl_pct = (current_price - pos.entry_price) / pos.entry_price
        pnl_usd = pos.size_usd * pnl_pct - pos.size_usd * config.FEE_RATE * 2

        event = {
            "pair":       pair,
            "strategy":   "momentum",
            "entry":      pos.entry_price,
            "exit":       current_price,
            "size_usd":   pos.size_usd,
            "pnl_usd":    round(pnl_usd, 4),
            "pnl_pct":    round(pnl_pct * 100, 3),
            "reason":     reason,
        }
        del self.positions[pair]
        log.info("[MOM] Exit %s | reason=%s pnl=$%.4f (%.2f%%)", pair, reason, pnl_usd, pnl_pct * 100)
        return event
