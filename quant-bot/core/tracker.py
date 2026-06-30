"""
Trade tracker — SQLite-backed log of every completed trade + live stats.
"""

import sqlite3
import logging
import os
from datetime import datetime
from typing import List, Dict

log = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "trades.db")


class Tracker:

    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self._init_db()
        self.trades: List[dict] = []
        self._load_existing()

    def _init_db(self):
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id          TEXT PRIMARY KEY,
                pair        TEXT,
                strategy    TEXT,
                side        TEXT,
                entry       REAL,
                exit        REAL,
                size_usd    REAL,
                pnl_usd     REAL,
                pnl_pct     REAL,
                reason      TEXT,
                closed_at   TEXT
            )
        """)
        self.conn.commit()

    def _load_existing(self):
        rows = self.conn.execute("SELECT * FROM trades ORDER BY closed_at").fetchall()
        cols = ["id", "pair", "strategy", "side", "entry", "exit",
                "size_usd", "pnl_usd", "pnl_pct", "reason", "closed_at"]
        self.trades = [dict(zip(cols, r)) for r in rows]

    def record(self, trade: dict):
        trade.setdefault("id", f"{trade['pair']}-{datetime.utcnow().isoformat()}")
        trade["closed_at"] = datetime.utcnow().isoformat()
        self.trades.append(trade)
        self.conn.execute("""
            INSERT OR REPLACE INTO trades
            (id, pair, strategy, side, entry, exit, size_usd, pnl_usd, pnl_pct, reason, closed_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, (
            trade["id"], trade["pair"], trade["strategy"], trade.get("side", "buy"),
            trade["entry"], trade["exit"], trade["size_usd"],
            trade["pnl_usd"], trade["pnl_pct"], trade["reason"], trade["closed_at"],
        ))
        self.conn.commit()

    # ------------------------------------------------------------------
    @property
    def total_trades(self) -> int:
        return len(self.trades)

    @property
    def wins(self) -> int:
        return sum(1 for t in self.trades if t["pnl_usd"] > 0)

    @property
    def losses(self) -> int:
        return sum(1 for t in self.trades if t["pnl_usd"] <= 0)

    @property
    def win_rate(self) -> float:
        if not self.trades:
            return 0.0
        return self.wins / len(self.trades) * 100

    @property
    def total_pnl(self) -> float:
        return sum(t["pnl_usd"] for t in self.trades)

    @property
    def avg_win(self) -> float:
        wins = [t["pnl_usd"] for t in self.trades if t["pnl_usd"] > 0]
        return sum(wins) / len(wins) if wins else 0.0

    @property
    def avg_loss(self) -> float:
        losses = [t["pnl_usd"] for t in self.trades if t["pnl_usd"] <= 0]
        return sum(losses) / len(losses) if losses else 0.0

    @property
    def profit_factor(self) -> float:
        gross_win  = sum(t["pnl_usd"] for t in self.trades if t["pnl_usd"] > 0)
        gross_loss = abs(sum(t["pnl_usd"] for t in self.trades if t["pnl_usd"] <= 0))
        return gross_win / gross_loss if gross_loss > 0 else float("inf")

    def by_strategy(self) -> Dict[str, dict]:
        result: Dict[str, dict] = {}
        for t in self.trades:
            s = t["strategy"]
            if s not in result:
                result[s] = {"trades": 0, "wins": 0, "pnl": 0.0}
            result[s]["trades"] += 1
            result[s]["pnl"]    += t["pnl_usd"]
            if t["pnl_usd"] > 0:
                result[s]["wins"] += 1
        return result

    def summary(self) -> str:
        lines = [
            "=" * 55,
            f"  TRADES: {self.total_trades}  |  WIN RATE: {self.win_rate:.1f}%  |  P&L: ${self.total_pnl:+.4f}",
            f"  Avg Win: ${self.avg_win:.4f}  |  Avg Loss: ${self.avg_loss:.4f}  |  PF: {self.profit_factor:.2f}",
        ]
        for strat, s in self.by_strategy().items():
            wr = s["wins"] / s["trades"] * 100 if s["trades"] else 0
            lines.append(f"  [{strat:15}] trades={s['trades']} win={wr:.0f}% pnl=${s['pnl']:+.4f}")
        lines.append("=" * 55)
        return "\n".join(lines)
