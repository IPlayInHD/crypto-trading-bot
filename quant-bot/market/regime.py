import pandas as pd
import talib
import logging
from typing import Dict

log = logging.getLogger(__name__)

TRENDING_UP   = "trending_up"
TRENDING_DOWN = "trending_down"
RANGING       = "ranging"
VOLATILE      = "volatile"
UNKNOWN       = "unknown"


def detect(df: pd.DataFrame) -> str:
    if df is None or len(df) < 30:
        return UNKNOWN
    try:
        close = df["close"].values
        high  = df["high"].values
        low   = df["low"].values

        adx      = talib.ADX(high, low, close, timeperiod=14)
        ema_fast = talib.EMA(close, timeperiod=9)
        ema_slow = talib.EMA(close, timeperiod=21)
        upper, middle, lower = talib.BBANDS(close, timeperiod=20, nbdevup=2, nbdevdn=2)
        bbw = (upper - lower) / middle  # Bollinger Band Width

        last_adx      = adx[-1]
        last_ema_fast = ema_fast[-1]
        last_ema_slow = ema_slow[-1]
        last_bbw      = bbw[-1]
        med_bbw       = float(pd.Series(bbw).median())

        import math
        if any(math.isnan(v) for v in [last_adx, last_ema_fast, last_ema_slow, last_bbw, med_bbw]):
            return UNKNOWN

        if last_bbw > 1.5 * med_bbw:
            return VOLATILE
        if last_adx > 25:
            return TRENDING_UP if last_ema_fast > last_ema_slow else TRENDING_DOWN
        return RANGING
    except Exception as e:
        log.debug("Regime error: %s", e)
        return UNKNOWN


def classify_all(ohlcv_map: Dict[str, pd.DataFrame]) -> Dict[str, str]:
    return {sym: detect(df) for sym, df in ohlcv_map.items()}
