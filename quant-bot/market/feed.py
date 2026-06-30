import ccxt
import pandas as pd
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional
import config

log = logging.getLogger(__name__)


def make_exchange() -> ccxt.binance:
    params = {
        "enableRateLimit": True,
        "options": {"defaultType": "spot"},
    }
    if config.BINANCE_API_KEY:
        params["apiKey"] = config.BINANCE_API_KEY
        params["secret"] = config.BINANCE_API_SECRET
    return ccxt.binance(params)


def get_top_pairs(exchange: ccxt.binance, n: int = 30) -> List[str]:
    markets  = exchange.load_markets()
    tickers  = exchange.fetch_tickers()

    candidates = []
    for symbol, ticker in tickers.items():
        if not symbol.endswith(f"/{config.QUOTE}"):
            continue
        if symbol not in markets:
            continue
        market = markets[symbol]
        if not market.get("spot", False):
            continue
        # skip stablecoins and wrapped tokens
        base = market["base"]
        if base in {"USDC", "BUSD", "DAI", "TUSD", "USDP", "FDUSD", "WBTC", "WETH"}:
            continue
        vol = (ticker.get("quoteVolume") or 0)
        if vol < config.MIN_VOLUME_24H:
            continue
        price = ticker.get("last") or 0
        if price <= 0:
            continue
        candidates.append((symbol, vol))

    candidates.sort(key=lambda x: x[1], reverse=True)
    selected = [s for s, _ in candidates[:n]]
    log.info("Scanning %d pairs: %s", len(selected), selected[:5])
    return selected


def fetch_ohlcv(exchange: ccxt.binance, symbol: str, timeframe: str) -> Optional[pd.DataFrame]:
    try:
        raw = exchange.fetch_ohlcv(symbol, timeframe, limit=config.OHLCV_LIMIT)
        if not raw or len(raw) < 30:
            return None
        df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        df.set_index("timestamp", inplace=True)
        df = df.astype(float)
        return df
    except Exception as e:
        log.debug("OHLCV fetch failed %s: %s", symbol, e)
        return None


def fetch_prices(exchange: ccxt.binance, symbols: List[str]) -> Dict[str, float]:
    prices: Dict[str, float] = {}
    try:
        tickers = exchange.fetch_tickers(symbols)
        for sym, t in tickers.items():
            p = t.get("last") or t.get("bid") or 0
            if p > 0:
                prices[sym] = float(p)
    except Exception as e:
        log.warning("Price fetch error: %s", e)
    return prices


def fetch_ohlcv_batch(
    exchange: ccxt.binance,
    symbols: List[str],
    timeframe: str,
    workers: int = 5,
) -> Dict[str, pd.DataFrame]:
    results: Dict[str, pd.DataFrame] = {}

    def _fetch(sym):
        time.sleep(0.05)   # gentle rate-limit cushion
        return sym, fetch_ohlcv(exchange, sym, timeframe)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch, s): s for s in symbols}
        for fut in as_completed(futures):
            sym, df = fut.result()
            if df is not None:
                results[sym] = df

    return results
