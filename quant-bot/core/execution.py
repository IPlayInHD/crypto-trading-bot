"""
Execution engine — routes signals to paper fills or live Binance orders.
"""

import logging
import ccxt
from typing import Optional
import config
from core.risk import RiskManager
from core.tracker import Tracker

log = logging.getLogger(__name__)


class Executor:

    def __init__(self, exchange: ccxt.binance, risk: RiskManager, tracker: Tracker):
        self.exchange = exchange
        self.risk     = risk
        self.tracker  = tracker

    # ------------------------------------------------------------------
    def open_trade(self, signal: dict) -> bool:
        """
        Attempt to open a trade from a strategy signal.
        Returns True if order was placed / simulated.
        """
        size = signal["size_usd"]
        ok, reason = self.risk.can_open(size)
        if not ok:
            log.debug("Trade blocked (%s): %s", signal["pair"], reason)
            return False

        if config.PAPER_TRADING:
            self._paper_fill(signal)
        else:
            self._live_order(signal)

        self.risk.on_open(size)
        return True

    def close_trade(self, event: dict):
        """Record a closed trade from a strategy exit event."""
        self.risk.on_close(event["size_usd"], event["pnl_usd"])
        self.tracker.record(event)
        self._log_close(event)

    # ------------------------------------------------------------------
    def _paper_fill(self, signal: dict):
        fill_price = signal["entry"] * (1 + config.SLIPPAGE if signal["side"] == "buy" else 1 - config.SLIPPAGE)
        log.info(
            "[PAPER] %s %s %s @ %.6f  size=$%.2f  sl=%.6f  tp=%.6f",
            signal["strategy"].upper(), signal["side"].upper(), signal["pair"],
            fill_price, signal["size_usd"], signal["stop_loss"], signal["take_profit"],
        )

    def _live_order(self, signal: dict):
        try:
            market  = self.exchange.market(signal["pair"])
            amount  = signal["size_usd"] / signal["entry"]
            amount  = self.exchange.amount_to_precision(signal["pair"], amount)
            order   = self.exchange.create_order(
                symbol = signal["pair"],
                type   = "market",
                side   = signal["side"],
                amount = amount,
            )
            log.info("[LIVE] Order placed: %s", order.get("id"))
        except ccxt.BaseError as e:
            log.error("[LIVE] Order failed %s: %s", signal["pair"], e)

    def _log_close(self, event: dict):
        emoji = "✅" if event["pnl_usd"] > 0 else "❌"
        log.info(
            "%s [%s] %s | exit=%.6f | pnl=$%+.4f (%.2f%%) | reason=%s",
            emoji,
            event["strategy"].upper(),
            event["pair"],
            event["exit"],
            event["pnl_usd"],
            event["pnl_pct"],
            event["reason"],
        )
