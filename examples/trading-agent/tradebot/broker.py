"""Brokers: PaperBroker for simulation; LiveBroker skeleton that fails closed."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Callable

from .journal import Journal


@dataclass(frozen=True)
class Order:
    symbol: str
    side: str  # "buy" | "sell"
    qty: int
    client_order_id: str
    limit_price: float | None = None


def client_order_id(strategy: str, symbol: str, ts: str, side: str) -> str:
    """Deterministic ID so retries/restarts cannot double-submit the same decision."""
    return f"{strategy}:{symbol}:{ts}:{side}"


@dataclass
class Fill:
    order: Order
    price: float
    commission: float
    ts: str


class Broker:
    def submit(self, order: Order, ref_price: float, ts: str) -> Fill | None:
        raise NotImplementedError

    def position(self, symbol: str) -> int:
        raise NotImplementedError

    def equity(self, prices: dict[str, float]) -> float:
        raise NotImplementedError


class PaperBroker(Broker):
    def __init__(
        self,
        cash: float,
        commission_per_order: float = 0.0,
        slippage_bps: float = 5.0,
        journal: Journal | None = None,
    ):
        self.cash = cash
        self.commission = commission_per_order
        self.slippage = slippage_bps / 10_000
        self.positions: dict[str, int] = {}
        self.fills: list[Fill] = []
        self._seen: set[str] = set()
        self.journal = journal or Journal()

    def submit(self, order: Order, ref_price: float, ts: str) -> Fill | None:
        if order.client_order_id in self._seen:
            self.journal.log("duplicate_order_ignored", id=order.client_order_id)
            return None
        if order.qty <= 0:
            raise ValueError("qty must be positive")
        sign = 1 if order.side == "buy" else -1
        price = ref_price * (1 + sign * self.slippage)
        if order.limit_price is not None:
            if (order.side == "buy" and price > order.limit_price) or (
                order.side == "sell" and price < order.limit_price
            ):
                self.journal.log("limit_not_filled", id=order.client_order_id, price=price)
                return None
        held = self.positions.get(order.symbol, 0)
        if order.side == "sell" and order.qty > held:
            raise ValueError("paper broker is long-only: cannot sell more than held")
        cost = sign * order.qty * price + self.commission
        if order.side == "buy" and cost > self.cash:
            self.journal.log("insufficient_cash", id=order.client_order_id)
            return None
        self.cash -= cost
        self.positions[order.symbol] = held + sign * order.qty
        self._seen.add(order.client_order_id)
        fill = Fill(order, price, self.commission, ts)
        self.fills.append(fill)
        self.journal.log("fill", id=order.client_order_id, side=order.side,
                         qty=order.qty, price=round(price, 4), ts=ts)
        return fill

    def position(self, symbol: str) -> int:
        return self.positions.get(symbol, 0)

    def equity(self, prices: dict[str, float]) -> float:
        return self.cash + sum(q * prices[s] for s, q in self.positions.items() if q)


class LiveBroker(Broker):
    """Skeleton for a real broker adapter. Fails closed by design.

    Live orders need BOTH the environment variable TRADEBOT_LIVE=1 AND an
    ``approve`` callback that returns True for that specific order (e.g. a
    human typing 'yes'). Subclass and implement ``_send``, ``position`` and
    ``equity`` with your broker's official API; load keys from env vars only.
    """

    def __init__(self, approve: Callable[[Order, float], bool], journal: Journal | None = None):
        self.approve = approve
        self.journal = journal or Journal()

    def submit(self, order: Order, ref_price: float, ts: str) -> Fill | None:
        if os.environ.get("TRADEBOT_LIVE") != "1":
            raise PermissionError("live trading disabled: set TRADEBOT_LIVE=1 to enable")
        if not self.approve(order, ref_price):
            self.journal.log("live_order_declined", id=order.client_order_id)
            return None
        self.journal.log("live_order_approved", id=order.client_order_id)
        return self._send(order, ref_price, ts)

    def _send(self, order: Order, ref_price: float, ts: str) -> Fill | None:
        raise NotImplementedError("implement with your broker's official API")
