"""
Quant Trading Bot — Multi-Strategy (Grid + Momentum + Mean Reversion)
Exchange: Binance Spot
Mode:     Paper (default) or Live
"""

import logging
import os
import sys
import time
from datetime import datetime, date

import config
from market.feed   import make_exchange, get_top_pairs, fetch_prices, fetch_ohlcv_batch
from market.regime import classify_all, RANGING, VOLATILE, TRENDING_UP, TRENDING_DOWN
from strategies.grid          import GridStrategy
from strategies.momentum      import MomentumStrategy
from strategies.mean_reversion import MeanReversionStrategy
from core.risk      import RiskManager
from core.execution import Executor
from core.tracker   import Tracker

# ── Logging ───────────────────────────────────────────────────────────
logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt = "%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("quant_bot.log"),
    ],
)
log = logging.getLogger(__name__)


def banner():
    mode = "PAPER" if config.PAPER_TRADING else "LIVE"
    log.info("=" * 55)
    log.info("  Quant Bot  |  Mode: %s  |  Balance: $%.2f", mode, config.INITIAL_BALANCE)
    log.info("  Strategies: Grid + Momentum + Mean Reversion")
    log.info("  Max positions: %d  |  Daily loss limit: %.0f%%", config.MAX_POSITIONS, config.DAILY_LOSS_LIMIT * 100)
    log.info("=" * 55)


def main():
    banner()

    exchange = make_exchange()
    tracker  = Tracker()
    risk     = RiskManager(config.INITIAL_BALANCE)
    executor = Executor(exchange, risk, tracker)

    grid_strat = GridStrategy()
    mom_strat  = MomentumStrategy()
    mr_strat   = MeanReversionStrategy()

    # Fetch tradeable universe
    log.info("Loading market universe...")
    pairs = get_top_pairs(exchange, config.MAX_PAIRS)
    log.info("Loaded %d pairs", len(pairs))

    last_regime_refresh = 0.0
    last_signal_check   = 0.0
    last_daily_reset    = date.today()

    regimes: dict   = {}
    ohlcv_1h: dict  = {}
    ohlcv_5m: dict  = {}

    while True:
        now = time.time()
        today = date.today()

        # Daily reset
        if today != last_daily_reset:
            risk.reset_daily()
            last_daily_reset = today
            log.info("New trading day — daily stats reset")

        # ── Price tick (every TICK_INTERVAL seconds) ──────────────────
        prices = fetch_prices(exchange, pairs)
        if not prices:
            time.sleep(config.TICK_INTERVAL)
            continue

        # ── Regime refresh (every 5 minutes) ─────────────────────────
        if now - last_regime_refresh > config.REGIME_INTERVAL:
            log.info("Refreshing regimes for %d pairs...", len(pairs))
            ohlcv_1h = fetch_ohlcv_batch(exchange, pairs, config.REGIME_TF)
            regimes  = classify_all(ohlcv_1h)

            counts = {}
            for r in regimes.values():
                counts[r] = counts.get(r, 0) + 1
            log.info("Regime snapshot: %s", counts)

            # Also refresh 5m data when we refresh regimes
            ohlcv_5m = fetch_ohlcv_batch(exchange, pairs, config.SIGNAL_TF)
            last_regime_refresh = now

        # ── Grid tick (check fills every TICK_INTERVAL) ───────────────
        for pair, price in prices.items():
            fills = grid_strat.tick(pair, price)
            for fill in fills:
                pnl = fill["size_usd"] * config.GRID_SPREAD - fill["size_usd"] * config.FEE_RATE * 2
                if fill["side"] == "sell":
                    # Only record profit on the closing (sell) side of each grid round-trip
                    trade = {
                        "pair":     pair,
                        "strategy": "grid",
                        "side":     "buy",
                        "entry":    fill["price"] * (1 - config.GRID_SPREAD),
                        "exit":     fill["price"],
                        "size_usd": fill["size_usd"],
                        "pnl_usd":  round(pnl, 4),
                        "pnl_pct":  round(config.GRID_SPREAD * 100 - config.FEE_RATE * 200, 3),
                        "reason":   "grid_sell",
                    }
                    executor.close_trade(trade)

            # Close grid if price drifted too far from center
            if grid_strat.is_price_far_from_center(pair, price):
                grid_strat.close_grid(pair)

        # ── Exit checks — momentum & mean reversion ───────────────────
        for pair, price in prices.items():
            df5 = ohlcv_5m.get(pair)

            exit_event = mom_strat.check_exit(pair, df5, price)
            if exit_event:
                executor.close_trade(exit_event)

            exit_event = mr_strat.check_exit(pair, df5, price)
            if exit_event:
                executor.close_trade(exit_event)

        # ── Signal scan (every 30 seconds) ───────────────────────────
        if now - last_signal_check > config.SIGNAL_INTERVAL:
            if not risk.halted:
                ohlcv_5m = fetch_ohlcv_batch(exchange, pairs, config.SIGNAL_TF, workers=5)

                for pair in pairs:
                    regime = regimes.get(pair, "unknown")
                    price  = prices.get(pair, 0)
                    df5    = ohlcv_5m.get(pair)

                    if not price or df5 is None:
                        continue

                    # ── Grid entries (ranging markets) ────────────────
                    if regime == RANGING:
                        if grid_strat.should_enter(pair, price, risk.available):
                            alloc = min(risk.available * config.MAX_POSITION_PCT,
                                        risk.available * 0.25)
                            if alloc >= config.MIN_ORDER_USD:
                                state = grid_strat.open_grid(pair, price, alloc)
                                risk.on_open(alloc)

                    # ── Momentum entries (trending up) ────────────────
                    if regime == TRENDING_UP:
                        signal = mom_strat.check_entry(pair, df5, risk.available)
                        if signal:
                            executor.open_trade(signal)
                            mom_strat.open_position(signal)

                    # ── Mean reversion entries (ranging or volatile) ──
                    if regime in (RANGING, VOLATILE):
                        signal = mr_strat.check_entry(pair, df5, risk.available)
                        if signal:
                            executor.open_trade(signal)
                            mr_strat.open_position(signal)

            last_signal_check = now

            # Print status every signal cycle
            log.info(risk.status_line())
            if tracker.total_trades > 0:
                log.info(tracker.summary())

        time.sleep(config.TICK_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("\nBot stopped by user.")
        tracker = Tracker()
        if tracker.total_trades > 0:
            print(tracker.summary())
