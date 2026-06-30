import logging
import uuid
import pandas as pd
import talib
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


class MomentumStrategy:

    def __init__(self):
        self.positions: Dict[str, MomentumPosition] = {}

    def check_entry(self, pair: str, df: pd.DataFrame, available_usd: float) -> Optional[dict]:
        if pair in self.positions or available_usd < config.MIN_ORDER_USD:
            return None
        if df is None or len(df) < config.EMA_SLOW + 5:
            return None

        close    = df["close"].values
        high     = df["high"].values
        low      = df["low"].values
        ema_fast = talib.EMA(close, timeperiod=config.EMA_FAST)
        ema_slow = talib.EMA(close, timeperiod=config.EMA_SLOW)
        rsi      = talib.RSI(close, timeperiod=config.RSI_PERIOD)
        atr      = talib.ATR(high, low, close, timeperiod=14)

        import math
        if any(math.isnan(v) for v in [ema_fast[-1], ema_fast[-2], ema_slow[-1], ema_slow[-2], rsi[-1], atr[-1]]):
            return None

        crossed_up = ema_fast[-2] <= ema_slow[-2] and ema_fast[-1] > ema_slow[-1]
        rsi_ok     = config.RSI_BUY_MIN <= rsi[-1] <= config.RSI_BUY_MAX

        if not (crossed_up and rsi_ok):
            return None

        price = float(close[-1])
        atr_v = float(atr[-1])
        sl    = round(price - config.MOMENTUM_SL_ATR * atr_v, 8)
        tp    = round(price + config.MOMENTUM_TP_ATR * atr_v, 8)
        size  = max(min(available_usd * config.MAX_POSITION_PCT, available_usd * 0.25), config.MIN_ORDER_USD)

        log.info("[MOM] Signal %s entry=%.6f sl=%.6f tp=%.6f rsi=%.1f", pair, price, sl, tp, rsi[-1])
        return {"id": str(uuid.uuid4())[:8], "pair": pair, "strategy": "momentum",
                "side": "buy", "entry": price, "stop_loss": sl, "take_profit": tp,
                "size_usd": size, "reason": f"EMA cross RSI={rsi[-1]:.1f}"}

    def open_position(self, signal: dict):
        self.positions[signal["pair"]] = MomentumPosition(
            id=signal["id"], pair=signal["pair"], entry_price=signal["entry"],
            stop_loss=signal["stop_loss"], take_profit=signal["take_profit"], size_usd=signal["size_usd"])

    def check_exit(self, pair: str, df: pd.DataFrame, price: float) -> Optional[dict]:
        if pair not in self.positions:
            return None
        pos    = self.positions[pair]
        reason = None

        if price <= pos.stop_loss:
            reason = "stop_loss"
        elif price >= pos.take_profit:
            reason = "take_profit"
        elif df is not None and len(df) >= config.EMA_SLOW + 2:
            close    = df["close"].values
            ema_fast = talib.EMA(close, timeperiod=config.EMA_FAST)
            ema_slow = talib.EMA(close, timeperiod=config.EMA_SLOW)
            import math
            if not math.isnan(ema_fast[-1]) and not math.isnan(ema_slow[-1]):
                if ema_fast[-1] < ema_slow[-1]:
                    reason = "ema_reversal"

        if reason is None:
            return None

        pnl_pct = (price - pos.entry_price) / pos.entry_price
        pnl_usd = pos.size_usd * pnl_pct - pos.size_usd * config.FEE_RATE * 2
        del self.positions[pair]
        log.info("[MOM] Exit %s reason=%s pnl=$%.4f", pair, reason, pnl_usd)
        return {"pair": pair, "strategy": "momentum", "side": "buy",
                "entry": pos.entry_price, "exit": price, "size_usd": pos.size_usd,
                "pnl_usd": round(pnl_usd, 4), "pnl_pct": round(pnl_pct * 100, 3), "reason": reason}
