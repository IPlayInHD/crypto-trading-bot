import pandas as pd
import pandas_ta as ta
import logging
from typing import Dict

log = logging.getLogger(__name__)

TRENDING_UP   = "trending_up"
TRENDING_DOWN = "trending_down"
RANGING       = "ranging"
VOLATILE      = "volatile"
UNKNOWN       = "unknown"


def detect(df: pd.DataFrame) -> str:
    """
    Classify market regime from hourly OHLCV.

    Rules:
    - ADX > 25 + EMA9 > EMA21  → TRENDING_UP
    - ADX > 25 + EMA9 < EMA21  → TRENDING_DOWN
    - BBW > 1.5 * median BBW   → VOLATILE  (sudden expansion)
    - ADX < 20                 → RANGING
    - else                     → RANGING (default safe choice)
    """
    if df is None or len(df) < 30:
        return UNKNOWN

    try:
        df = df.copy()

        # ADX
        adx_df = ta.adx(df["high"], df["low"], df["close"], length=14)
        df["adx"] = adx_df[f"ADX_14"].values

        # EMA
        df["ema_fast"] = ta.ema(df["close"], length=9)
        df["ema_slow"] = ta.ema(df["close"], length=21)

        # Bollinger Band Width
        bb = ta.bbands(df["close"], length=20, std=2.0)
        df["bbw"] = bb["BBB_20_2.0"].values   # bandwidth column

        last     = df.iloc[-1]
        adx      = last["adx"]
        ema_fast = last["ema_fast"]
        ema_slow = last["ema_slow"]
        bbw      = last["bbw"]
        med_bbw  = df["bbw"].median()

        if bbw > 1.5 * med_bbw:
            return VOLATILE

        if adx > 25:
            return TRENDING_UP if ema_fast > ema_slow else TRENDING_DOWN

        return RANGING

    except Exception as e:
        log.debug("Regime detection error: %s", e)
        return UNKNOWN


def classify_all(ohlcv_map: Dict[str, pd.DataFrame]) -> Dict[str, str]:
    return {sym: detect(df) for sym, df in ohlcv_map.items()}
