import logging
import uuid
import pandas as pd
import talib
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
    target:      float
    size_usd:    float


class MeanReversionStrategy:

    def __init__(self):
        self.positions: Dict[str, MRPosition] = {}

    def check_entry(self, pair: str, df: pd.DataFrame, available_usd: float) -> Optional[dict]:
        if pair in self.positions or available_usd < config.MIN_ORDER_USD:
            return None
        if df is None or len(df) < config.BB_PERIOD + 5:
            return None

        close = df["close"].values
        upper, middle, lower = talib.BBANDS(close, timeperiod=config.BB_PERIOD,
                                            nbdevup=config.BB_STD, nbdevdn=config.BB_STD)
        rsi = talib.RSI(close, timeperiod=14)

        import math
        if any(math.isnan(v) for v in [lower[-1], middle[-1], rsi[-1]]):
            return None

        price = float(close[-1])
        bbl   = float(lower[-1])
        bbm   = float(middle[-1])

        if not (price <= bbl * 1.002 and rsi[-1] < config.MR_RSI_ENTRY):
            return None

        sl   = round(price * (1 - config.MR_SL_PCT), 8)
        size = max(min(available_usd * config.MAX_POSITION_PCT, available_usd * 0.25), config.MIN_ORDER_USD)

        log.info("[MR] Signal %s entry=%.6f target=%.6f sl=%.6f rsi=%.1f", pair, price, bbm, sl, rsi[-1])
        return {"id": str(uuid.uuid4())[:8], "pair": pair, "strategy": "mean_reversion",
                "side": "buy", "entry": price, "stop_loss": sl, "take_profit": bbm,
                "size_usd": size, "reason": f"BB lower RSI={rsi[-1]:.1f}"}

    def open_position(self, signal: dict):
        self.positions[signal["pair"]] = MRPosition(
            id=signal["id"], pair=signal["pair"], entry_price=signal["entry"],
            stop_loss=signal["stop_loss"], target=signal["take_profit"], size_usd=signal["size_usd"])

    def check_exit(self, pair: str, df: pd.DataFrame, price: float) -> Optional[dict]:
        if pair not in self.positions:
            return None
        pos    = self.positions[pair]
        target = pos.target

        if df is not None and len(df) >= config.BB_PERIOD:
            close = df["close"].values
            upper, middle, lower = talib.BBANDS(close, timeperiod=config.BB_PERIOD,
                                                nbdevup=config.BB_STD, nbdevdn=config.BB_STD)
            import math
            if not math.isnan(middle[-1]):
                target = float(middle[-1])

        reason = None
        if price <= pos.stop_loss:
            reason = "stop_loss"
        elif price >= target:
            reason = "take_profit"

        if reason is None:
            return None

        pnl_pct = (price - pos.entry_price) / pos.entry_price
        pnl_usd = pos.size_usd * pnl_pct - pos.size_usd * config.FEE_RATE * 2
        del self.positions[pair]
        log.info("[MR] Exit %s reason=%s pnl=$%.4f", pair, reason, pnl_usd)
        return {"pair": pair, "strategy": "mean_reversion", "side": "buy",
                "entry": pos.entry_price, "exit": price, "size_usd": pos.size_usd,
                "pnl_usd": round(pnl_usd, 4), "pnl_pct": round(pnl_pct * 100, 3), "reason": reason}
