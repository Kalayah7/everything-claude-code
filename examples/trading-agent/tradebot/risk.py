"""Risk manager: sizing, exposure caps, daily-loss halt, drawdown kill switch.

Every order must pass ``RiskManager.approve_order`` before reaching a broker.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class RiskLimits:
    risk_per_trade: float = 0.01       # fraction of equity lost if the stop is hit
    max_position_pct: float = 0.20     # max notional of one position / equity
    max_gross_exposure: float = 1.0    # total notional / equity (1.0 = no leverage)
    daily_loss_limit: float = 0.02     # halt for the day after this loss from day start
    max_drawdown: float = 0.15         # kill switch: halt until a human resets
    max_orders_per_day: int = 50

    def __post_init__(self) -> None:
        for name in ("risk_per_trade", "max_position_pct", "daily_loss_limit", "max_drawdown"):
            v = getattr(self, name)
            if not 0 < v < 1:
                raise ValueError(f"{name} must be between 0 and 1, got {v}")
        if not 0 < self.max_gross_exposure <= 4:
            raise ValueError("max_gross_exposure must be in (0, 4]")
        if self.max_orders_per_day < 1:
            raise ValueError("max_orders_per_day must be >= 1")


class RiskManager:
    def __init__(self, limits: RiskLimits | None = None):
        self.limits = limits or RiskLimits()
        self.peak_equity: float | None = None
        self.day: str | None = None
        self.day_start_equity: float | None = None
        self.orders_today = 0
        self.halted_today = False
        self.killed = False
        self.events: list[dict] = []

    # ---- state updates -------------------------------------------------
    def start_day(self, day: str, equity: float) -> None:
        if day != self.day:
            self.day = day
            self.day_start_equity = equity
            self.orders_today = 0
            self.halted_today = False
        self.on_equity(equity)

    def on_equity(self, equity: float) -> None:
        if self.peak_equity is None or equity > self.peak_equity:
            self.peak_equity = equity
        self.check_drawdown(equity)
        self.check_daily_loss(equity)

    def check_drawdown(self, equity: float) -> bool:
        if self.peak_equity and not self.killed:
            dd = 1 - equity / self.peak_equity
            if dd >= self.limits.max_drawdown:
                self.killed = True
                self._event("kill_switch", drawdown=round(dd, 4), equity=equity)
        return self.killed

    def check_daily_loss(self, equity: float) -> bool:
        if self.day_start_equity and not self.halted_today:
            loss = 1 - equity / self.day_start_equity
            if loss >= self.limits.daily_loss_limit:
                self.halted_today = True
                self._event("daily_loss_halt", loss=round(loss, 4), equity=equity)
        return self.halted_today

    @property
    def trading_allowed(self) -> bool:
        return not (self.killed or self.halted_today)

    def reset_kill_switch(self, confirmation: str) -> None:
        """Human-only reset. Requires typing the exact confirmation phrase."""
        if confirmation != "I have reviewed the drawdown and accept the risk":
            raise PermissionError("kill switch reset requires explicit human confirmation")
        self.killed = False
        self.peak_equity = None
        self._event("kill_switch_reset")

    # ---- sizing & approval ----------------------------------------------
    def position_size(self, equity: float, price: float, stop_distance: float | None) -> int:
        """Whole shares to buy, capped by per-trade risk, position cap and gross exposure."""
        if equity <= 0 or price <= 0:
            return 0
        caps = [
            equity * self.limits.max_position_pct / price,
            equity * self.limits.max_gross_exposure / price,
        ]
        if stop_distance and stop_distance > 0:
            caps.append(equity * self.limits.risk_per_trade / stop_distance)
        return max(0, math.floor(min(caps)))

    def approve_order(
        self, side: str, qty: int, price: float, equity: float, gross_exposure: float
    ) -> tuple[bool, str]:
        """Approve or reject an order. ``gross_exposure`` is current total notional.

        Risk-reducing sells are always allowed so the bot can flatten while halted.
        """
        if qty <= 0:
            return False, "qty must be positive"
        if side == "sell":
            return True, "risk-reducing"
        if side != "buy":
            return False, f"unknown side {side!r}"
        if self.killed:
            return self._reject("kill switch active")
        if self.halted_today:
            return self._reject("daily loss limit hit")
        if self.orders_today >= self.limits.max_orders_per_day:
            return self._reject("max orders per day")
        notional = qty * price
        if notional > equity * self.limits.max_position_pct * 1.0001:
            return self._reject("position too large")
        if gross_exposure + notional > equity * self.limits.max_gross_exposure * 1.0001:
            return self._reject("gross exposure limit")
        self.orders_today += 1
        return True, "ok"

    def _reject(self, reason: str) -> tuple[bool, str]:
        self._event("order_rejected", reason=reason)
        return False, reason

    def _event(self, kind: str, **fields) -> None:
        self.events.append({"event": kind, "day": self.day, **fields})
