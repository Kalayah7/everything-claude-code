"""Quick-trading (intraday) paper test on 5-minute bars, every trade with a 1:2 risk/reward.

Rules fixed BEFORE testing (2026-11-05). All long-only, at most one trade per
day, entry at the next bar's open after a signal, flat by the close.
Stop = 1R below entry, take profit = 2R above. If one bar touches both, the
stop is assumed to fill first (conservative).

* ``orb``      - opening-range breakout: first 30 min sets the range; buy the first
                 5-min close above the range high; stop = range low.
* ``vwap_dip`` - after 10:30, buy the first close >= 0.4% below VWAP; stop 0.4%.
* ``momentum`` - at 10:30, if price is >= 0.3% above the day's open, buy; stop 0.4%.

Usage:
    python3 -m tradebot.intraday --data DIR [--symbols SPY QQQ IWM] [--start-cash 5]
"""

from __future__ import annotations

import argparse
import os
from collections import OrderedDict
from dataclasses import dataclass

from .data import Bar, load_csv

OPEN_RANGE_BARS = 6      # 30 minutes of 5-min bars
FIRST_HOUR_BARS = 12     # 10:30 ET
LAST_ENTRY_BAR = 72      # no new entries in the last 30 minutes
REWARD_MULT = 2.0        # take profit at 2R
STRATEGIES = ("orb", "vwap_dip", "momentum")


@dataclass(frozen=True)
class Trade:
    day: str
    entry: float
    stop: float
    target: float
    exit: float
    reason: str  # "target" | "stop" | "close"

    def r_multiple(self, cost_frac: float) -> float:
        risk = self.entry - self.stop
        return (self.exit - self.entry - cost_frac * self.entry * 2) / risk

    def ret(self, cost_frac: float) -> float:
        return self.exit / self.entry - 1 - 2 * cost_frac


def group_days(bars: list[Bar]) -> "OrderedDict[str, list[Bar]]":
    days: "OrderedDict[str, list[Bar]]" = OrderedDict()
    for b in bars:
        days.setdefault(b.day, []).append(b)
    return days


def signal_index(strategy: str, day: list[Bar]) -> tuple[int, float | None] | None:
    """Return (bar index of the signal close, absolute stop or None for % stop)."""
    if strategy == "orb":
        hi = max(b.high for b in day[:OPEN_RANGE_BARS])
        lo = min(b.low for b in day[:OPEN_RANGE_BARS])
        for i in range(OPEN_RANGE_BARS, min(LAST_ENTRY_BAR, len(day) - 1)):
            if day[i].close > hi:
                return i, lo
        return None
    if strategy == "vwap_dip":
        pv = vol = 0.0
        for i, b in enumerate(day[: min(LAST_ENTRY_BAR, len(day) - 1)]):
            typical = (b.high + b.low + b.close) / 3
            w = b.volume or 1.0
            pv, vol = pv + typical * w, vol + w
            if i >= FIRST_HOUR_BARS - 1 and b.close <= (pv / vol) * (1 - 0.004):
                return i, None
        return None
    if strategy == "momentum":
        i = FIRST_HOUR_BARS - 1
        if len(day) > i + 1 and day[i].close >= day[0].open * 1.003:
            return i, None
        return None
    raise ValueError(f"unknown strategy {strategy!r}")


def simulate_day(strategy: str, day: list[Bar], slippage: float) -> Trade | None:
    sig = signal_index(strategy, day)
    if sig is None:
        return None
    i, abs_stop = sig
    entry = day[i + 1].open * (1 + slippage)
    stop = abs_stop if abs_stop is not None else entry * (1 - 0.004)
    risk = entry - stop
    if risk <= 0:
        return None
    target = entry + REWARD_MULT * risk
    for b in day[i + 1:]:
        if b.low <= stop:
            return Trade(day[0].day, entry, stop, target, min(stop, b.open) * (1 - slippage), "stop")
        if b.high >= target:
            return Trade(day[0].day, entry, stop, target, max(target, b.open) * (1 - slippage),
                         "target")
    return Trade(day[0].day, entry, stop, target, day[-1].close * (1 - slippage), "close")


def run(strategy: str, bars: list[Bar], slippage_bps: float = 2.0,
        pdt_limit: bool = False) -> list[Trade]:
    """All trades; with ``pdt_limit`` at most 3 trades in any 5 trading days."""
    slip = slippage_bps / 10_000
    trades: list[Trade] = []
    recent: list[int] = []
    for n, (_, day) in enumerate(group_days(bars).items()):
        recent = [k for k in recent if n - k < 5]
        if pdt_limit and len(recent) >= 3:
            continue
        t = simulate_day(strategy, day, slip)
        if t:
            trades.append(t)
            recent.append(n)
    return trades


def summarize(trades: list[Trade], start_cash: float, slippage_bps: float = 2.0) -> dict:
    cost = 0.0  # slippage is already in entry/exit prices
    eq = start_cash
    for t in trades:
        eq *= 1 + t.ret(cost)
    wins = [t for t in trades if t.exit > t.entry]
    rs = [t.r_multiple(cost) for t in trades]
    return {
        "trades": len(trades),
        "win_rate": len(wins) / len(trades) if trades else 0.0,
        "avg_r": sum(rs) / len(rs) if rs else 0.0,
        "targets": sum(t.reason == "target" for t in trades),
        "stops": sum(t.reason == "stop" for t in trades),
        "end_cash": eq,
    }


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Intraday 1:2 R/R paper test")
    p.add_argument("--data", required=True)
    p.add_argument("--symbols", nargs="+", default=["SPY", "QQQ", "IWM"])
    p.add_argument("--start-cash", type=float, default=5.0)
    p.add_argument("--slippage-bps", type=float, default=2.0)
    a = p.parse_args(argv)
    for sym in a.symbols:
        bars = load_csv(os.path.join(a.data, f"{sym}.csv"))
        days = group_days(bars)
        hold = bars[-1].close / bars[0].open
        print(f"\n{sym}: {len(days)} days {bars[0].day}..{bars[-1].day}   "
              f"buy & hold ${a.start_cash:.2f} -> ${a.start_cash * hold:.2f}")
        print(f"  {'strategy':<10}{'PDT':>5}{'trades':>8}{'win%':>6}{'avg R':>7}"
              f"{'TP/SL':>8}{'$ end':>8}")
        for s in STRATEGIES:
            for pdt in (False, True):
                st = summarize(run(s, bars, a.slippage_bps, pdt), a.start_cash)
                print(f"  {s:<10}{'yes' if pdt else 'no':>5}{st['trades']:>8}"
                      f"{st['win_rate']:>6.0%}{st['avg_r']:>7.2f}"
                      f"{st['targets']:>4}/{st['stops']:<3}{st['end_cash']:>8.2f}")
    print("\nPaper test only. Past results do not guarantee future returns.")


if __name__ == "__main__":
    main()
