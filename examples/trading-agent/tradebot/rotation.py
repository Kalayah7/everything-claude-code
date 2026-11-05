"""Steady Compounder: a monthly, long-only ETF rotation system for small accounts.

The system holds ONE asset at a time, chosen once a month at the close of the
last trading day, and trades at the next day's open:

* ``buy_hold``   - always VOO (benchmark)
* ``trend``      - VOO if its close > 200-day SMA, else cash (SGOV)
* ``dual_mom``   - of VOO/QQQ, the one with the higher 6-month return, if that
                   return is > 0 AND it is above its 200-day SMA; else cash

Why these: trend-following and momentum on broad index ETFs are among the most
widely documented effects, and a monthly schedule means few trades (no PDT
problems, low costs, works with fractional dollar orders). They do NOT win
every trade or every month. Their aim is to sidestep part of deep bear markets.

Usage:
    python3 -m tradebot.rotation --data DIR          # backtest all systems
    python3 -m tradebot.rotation --data DIR --today  # today's target holding
"""

from __future__ import annotations

import argparse
import math
import os
from dataclasses import dataclass

from .backtest import max_drawdown
from .data import Bar, load_csv

RISK_ON = ("VOO", "QQQ")
CASH = "SGOV"
SMA_DAYS = 200
MOM_DAYS = 126  # ~6 months


def sma(closes: list[float], n: int) -> float | None:
    return sum(closes[-n:]) / n if len(closes) >= n else None


def momentum(closes: list[float], n: int) -> float | None:
    return closes[-1] / closes[-n - 1] - 1 if len(closes) > n else None


def decide(system: str, closes: dict[str, list[float]]) -> str:
    """Target holding given closes up to and including today. Pure function."""
    if system == "buy_hold":
        return "VOO"
    if system == "trend":
        s = sma(closes["VOO"], SMA_DAYS)
        return "VOO" if s is not None and closes["VOO"][-1] > s else CASH
    if system == "dual_mom":
        best, best_m = None, -math.inf
        for sym in RISK_ON:
            m = momentum(closes[sym], MOM_DAYS)
            if m is not None and m > best_m:
                best, best_m = sym, m
        if best is None:
            return CASH
        s = sma(closes[best], SMA_DAYS)
        return best if best_m > 0 and s is not None and closes[best][-1] > s else CASH
    raise ValueError(f"unknown system {system!r}")


SYSTEMS = ("buy_hold", "trend", "dual_mom")


@dataclass
class RotationResult:
    system: str
    equity: list[tuple[str, float]]
    switches: int
    holdings: list[tuple[str, str]]  # (date, symbol) after each monthly decision

    def monthly_returns(self) -> dict[str, float]:
        ends: dict[str, float] = {}
        for d, e in self.equity:
            ends[d[:7]] = e
        months = sorted(ends)
        return {m: ends[m] / ends[p] - 1 for p, m in zip(months, months[1:])}

    def stats(self) -> dict:
        eq = [e for _, e in self.equity]
        years = len(eq) / 252
        mr = list(self.monthly_returns().values())
        return {
            "cagr": (eq[-1] / eq[0]) ** (1 / years) - 1,
            "max_drawdown": max_drawdown(eq),
            "pct_up_months": sum(r > 0 for r in mr) / len(mr),
            "worst_month": min(mr),
            "avg_month": sum(mr) / len(mr),
            "switches": self.switches,
        }


def run_rotation(
    system: str,
    bars: dict[str, list[Bar]],
    start_cash: float = 20.0,
    slippage_bps: float = 5.0,
    start: str | None = None,
    end: str | None = None,
) -> RotationResult:
    """Backtest one system. Decide at month-end close, fill next day's open."""
    dates = [b.ts for b in bars["VOO"]]
    idx = {s: {b.ts: b for b in bs} for s, bs in bars.items()}
    closes: dict[str, list[float]] = {s: [] for s in bars}
    last_close: dict[str, float] = {}
    held, units, cash = None, 0.0, start_cash
    pending: str | None = None
    equity, holdings, switches = [], [], 0
    slip = slippage_bps / 10_000

    def price(sym: str, d: str, field: str) -> float | None:
        b = idx.get(sym, {}).get(d)
        return getattr(b, field) if b else None

    for i, d in enumerate(dates):
        for s in bars:
            c = price(s, d, "close")
            if c is not None:
                closes[s].append(c)
                last_close[s] = c
        in_range = (start is None or d >= start) and (end is None or d < end)
        if not in_range:
            continue
        # fill pending switch at today's open
        if pending is not None and pending != held:
            sell_px = price(held, d, "open") if held not in (None, "CASH0") else 1.0
            buy_px = price(pending, d, "open") if pending != "CASH0" else 1.0
            if sell_px and buy_px:  # otherwise wait for a day both assets trade
                if held not in (None, "CASH0"):
                    cash, units = units * sell_px * (1 - slip), 0.0
                if pending != "CASH0":
                    units, cash = cash / (buy_px * (1 + slip)), 0.0
                held, pending = pending, None
                switches += 1
        # mark to market
        if held in (None, "CASH0"):
            value = cash
        else:
            value = units * last_close[held]
        equity.append((d, value))
        # month-end decision
        nxt = dates[i + 1] if i + 1 < len(dates) else None
        if nxt is None or nxt[:7] != d[:7] or held is None:
            target = decide(system, closes)
            if target == CASH and price(CASH, nxt or d, "open") is None:
                target = "CASH0"  # before SGOV existed: uninvested cash at 0%
            if target != held:
                pending = target
            holdings.append((d, target))
    return RotationResult(system, equity, switches, holdings)


def load_dir(path: str) -> dict[str, list[Bar]]:
    return {s: load_csv(os.path.join(path, f"{s}.csv")) for s in (*RISK_ON, CASH)
            if os.path.exists(os.path.join(path, f"{s}.csv"))}


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Steady Compounder monthly rotation")
    p.add_argument("--data", required=True, help="dir with VOO.csv, QQQ.csv, SGOV.csv")
    p.add_argument("--system", default="dual_mom", choices=SYSTEMS)
    p.add_argument("--today", action="store_true", help="print today's target holding")
    a = p.parse_args(argv)
    bars = load_dir(a.data)
    if a.today:
        closes = {s: [b.close for b in bs] for s, bs in bars.items()}
        print(f"{a.system}: hold {decide(a.system, closes)} (data through {bars['VOO'][-1].ts})")
        return
    periods = (("full", None, None), ("2016-2022", None, "2023-01-01"),
               ("2023-now (OOS)", "2023-01-01", None), ("2022 bear", "2022-01-01", "2023-01-01"))
    for label, s, e in periods:
        print(f"\n{label}")
        print(f"  {'system':<9} {'CAGR':>7} {'MaxDD':>7} {'Up mo':>6} {'Worst mo':>9} {'Switches':>8}")
        for sys_ in SYSTEMS:
            st = run_rotation(sys_, bars, start=s, end=e).stats()
            print(f"  {sys_:<9} {st['cagr']:>7.1%} {st['max_drawdown']:>7.1%} "
                  f"{st['pct_up_months']:>6.0%} {st['worst_month']:>9.1%} {st['switches']:>8}")
    print("\nPrice-only (no dividends). Past results do not guarantee future returns.")


if __name__ == "__main__":
    main()
