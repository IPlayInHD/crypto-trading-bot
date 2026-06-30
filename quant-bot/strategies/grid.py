"""
Grid trading strategy.

Activates in RANGING markets. Places a ladder of buy orders below the current
price and sell orders above it. Each time a buy fills, a matching sell is placed
one grid step higher. Profit = grid_spread - fees per round trip.
"""

import logging
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional
import config

log = logging.getLogger(__name__)


@dataclass
class GridLevel:
    price: float
    side: str          # 'buy' or 'sell'
    status: str        # 'pending' | 'filled' | 'done'
    order_id: str      = field(default_factory=lambda: str(uuid.uuid4())[:8])
    fill_price: float  = 0.0
    paired_sell: Optional[str] = None   # order_id of the corresponding sell


@dataclass
class GridState:
    pair:        str
    center:      float          # price when grid was placed
    levels:      List[GridLevel] = field(default_factory=list)
    alloc_usd:   float = 0.0
    active:      bool  = True


class GridStrategy:
    """
    Maintains one grid per pair. On each tick, checks if any pending orders
    would have been filled by the latest price (paper) or queries fills (live).
    """

    def __init__(self):
        self.grids: Dict[str, GridState] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def should_enter(self, pair: str, price: float, available_usd: float) -> bool:
        """Return True if we should open a new grid for this pair."""
        if pair in self.grids and self.grids[pair].active:
            return False
        if available_usd < config.MIN_ORDER_USD * 2:
            return False
        return True

    def open_grid(self, pair: str, price: float, alloc_usd: float) -> GridState:
        """Create grid levels around current price."""
        n     = config.GRID_LEVELS         # e.g. 4 → 2 buy, 2 sell
        half  = n // 2
        step  = config.GRID_SPREAD         # 0.5%
        levels: List[GridLevel] = []

        # Buy levels below current price
        for i in range(1, half + 1):
            lvl_price = round(price * (1 - step * i), 8)
            levels.append(GridLevel(price=lvl_price, side="buy", status="pending"))

        # Sell levels above current price
        for i in range(1, half + 1):
            lvl_price = round(price * (1 + step * i), 8)
            levels.append(GridLevel(price=lvl_price, side="sell", status="pending"))

        state = GridState(pair=pair, center=price, levels=levels, alloc_usd=alloc_usd)
        self.grids[pair] = state
        log.info(
            "[GRID] Opened grid %s | center=%.4f | levels=%d | alloc=$%.2f",
            pair, price, len(levels), alloc_usd,
        )
        return state

    def tick(self, pair: str, current_price: float) -> List[dict]:
        """
        Called on every price tick. Returns list of fill events:
          {'side': 'buy'|'sell', 'price': float, 'size_usd': float}
        """
        if pair not in self.grids:
            return []
        state = self.grids[pair]
        if not state.active:
            return []

        events = []
        per_level_usd = state.alloc_usd / (config.GRID_LEVELS // 2)

        for lvl in state.levels:
            if lvl.status != "pending":
                continue

            filled = False
            if lvl.side == "buy" and current_price <= lvl.price:
                filled = True
            elif lvl.side == "sell" and current_price >= lvl.price:
                filled = True

            if filled:
                lvl.status     = "filled"
                lvl.fill_price = current_price
                events.append({
                    "pair":     pair,
                    "side":     lvl.side,
                    "price":    lvl.fill_price,
                    "size_usd": per_level_usd,
                    "strategy": "grid",
                    "order_id": lvl.order_id,
                })
                log.info(
                    "[GRID] Fill %s %s @ %.6f  size=$%.2f",
                    lvl.side.upper(), pair, lvl.fill_price, per_level_usd,
                )

                # When a buy fills, add a sell one step above it
                if lvl.side == "buy":
                    sell_price = round(lvl.price * (1 + config.GRID_SPREAD), 8)
                    sell_lvl   = GridLevel(price=sell_price, side="sell", status="pending")
                    sell_lvl.paired_sell = lvl.order_id
                    state.levels.append(sell_lvl)

        return events

    def close_grid(self, pair: str):
        if pair in self.grids:
            self.grids[pair].active = False
            log.info("[GRID] Closed grid for %s", pair)

    def is_price_far_from_center(self, pair: str, price: float, threshold: float = 0.03) -> bool:
        """Return True if price has moved >3% from grid centre (grid no longer useful)."""
        if pair not in self.grids:
            return False
        center = self.grids[pair].center
        return abs(price - center) / center > threshold
