"""Strategy interface plus one example strategy.

The example (SMA crossover) is only there to show the plumbing. It is NOT a
recommendation and has no proven edge.
"""

from __future__ import annotations

from dataclasses import dataclass

from .data import Bar


@dataclass(frozen=True)
class Signal:
    target: int  # 1 = be long, 0 = be flat (long-only starter)
    stop_distance: float | None = None  # $ per share from entry to stop, used for sizing


class Strategy:
    name = "base"

    def signal(self, history: list[Bar]) -> Signal:
        """Return the desired position given bars up to and including the current bar.

        ``history[-1]`` is the most recent *closed* bar. The engine fills at the
        NEXT bar's open, so you cannot trade on information you would not have had.
        """
        raise NotImplementedError


def sma(values: list[float], n: int) -> float:
    if len(values) < n:
        raise ValueError("not enough data")
    return sum(values[-n:]) / n


def atr(bars: list[Bar], n: int = 14) -> float:
    if len(bars) < n + 1:
        raise ValueError("not enough data")
    trs = []
    for prev, cur in zip(bars[-n - 1 : -1], bars[-n:]):
        trs.append(max(cur.high - cur.low, abs(cur.high - prev.close), abs(cur.low - prev.close)))
    return sum(trs) / n


class SmaCrossover(Strategy):
    """Long when fast SMA > slow SMA, flat otherwise. Stop = ``atr_mult`` x ATR."""

    def __init__(self, fast: int = 20, slow: int = 100, atr_n: int = 14, atr_mult: float = 3.0):
        if fast >= slow:
            raise ValueError("fast must be < slow")
        self.fast, self.slow, self.atr_n, self.atr_mult = fast, slow, atr_n, atr_mult
        self.name = f"sma{fast}-{slow}"

    def signal(self, history: list[Bar]) -> Signal:
        if len(history) < max(self.slow, self.atr_n + 1):
            return Signal(0)
        closes = [b.close for b in history]
        target = 1 if sma(closes, self.fast) > sma(closes, self.slow) else 0
        return Signal(target, self.atr_mult * atr(history, self.atr_n))
