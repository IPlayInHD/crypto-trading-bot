"""
Risk manager.

Enforces:
- Max simultaneous open positions
- Daily loss limit (halt trading if breached)
- Minimum order size
- Portfolio allocation per trade
"""

import logging
from typing import List
import config

log = logging.getLogger(__name__)


class RiskManager:

    def __init__(self, initial_balance: float):
        self.portfolio       = initial_balance
        self.available       = initial_balance
        self.daily_start     = initial_balance
        self.open_positions  = 0     # count across all strategies
        self.daily_pnl       = 0.0
        self.halted          = False

    # ------------------------------------------------------------------
    def can_open(self, size_usd: float) -> tuple[bool, str]:
        if self.halted:
            return False, "daily loss limit hit — trading halted for today"
        if self.open_positions >= config.MAX_POSITIONS:
            return False, f"max positions ({config.MAX_POSITIONS}) reached"
        if size_usd < config.MIN_ORDER_USD:
            return False, f"size ${size_usd:.2f} below minimum ${config.MIN_ORDER_USD}"
        if size_usd > self.available:
            return False, f"insufficient balance (need ${size_usd:.2f}, have ${self.available:.2f})"
        return True, "ok"

    def on_open(self, size_usd: float):
        self.available      -= size_usd
        self.open_positions += 1

    def on_close(self, size_usd: float, pnl_usd: float):
        self.available      += size_usd + pnl_usd
        self.portfolio      += pnl_usd
        self.daily_pnl      += pnl_usd
        self.open_positions  = max(0, self.open_positions - 1)
        self._check_daily_limit()

    def _check_daily_limit(self):
        loss_pct = -self.daily_pnl / self.daily_start if self.daily_start > 0 else 0
        if loss_pct >= config.DAILY_LOSS_LIMIT:
            self.halted = True
            log.warning(
                "DAILY LOSS LIMIT REACHED: down $%.4f (%.1f%%) — halting trading",
                abs(self.daily_pnl), loss_pct * 100,
            )

    def reset_daily(self):
        """Call at the start of each new trading day."""
        self.daily_start = self.portfolio
        self.daily_pnl   = 0.0
        self.halted      = False

    def status_line(self) -> str:
        return (
            f"Portfolio=${self.portfolio:.2f} | "
            f"Available=${self.available:.2f} | "
            f"Positions={self.open_positions}/{config.MAX_POSITIONS} | "
            f"DayPnL=${self.daily_pnl:+.4f} | "
            f"{'HALTED' if self.halted else 'ACTIVE'}"
        )
