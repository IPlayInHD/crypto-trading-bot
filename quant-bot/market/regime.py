import pandas as pd
import ta
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
        df = df.copy()
        df["adx"]      = ta.trend.ADXIndicator(df["high"], df["low"], df["close"], window=14).adx()
        df["ema_fast"] = ta.trend.EMAIndicator(df["close"], window=9).ema_indicator()
        df["ema_slow"] = ta.trend.EMAIndicator(df["close"], window=21).ema_indicator()
        bb             = ta.volatility.BollingerBands(df["close"], window=20, window_dev=2)
        df["bbw"]      = bb.bollinger_wband()

        last    = df.iloc[-1]
        adx     = last["adx"]
        bbw     = last["bbw"]
        med_bbw = df["bbw"].median()

        if bbw > 1.5 * med_bbw:
            return VOLATILE
        if adx > 25:
            return TRENDING_UP if last["ema_fast"] > last["ema_slow"] else TRENDING_DOWN
        return RANGING
    except Exception as e:
        log.debug("Regime error: %s", e)
        return UNKNOWN


def classify_all(ohlcv_map: Dict[str, pd.DataFrame]) -> Dict[str, str]:
    return {sym: detect(df) for sym, df in ohlcv_map.items()}
