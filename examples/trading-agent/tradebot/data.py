"""Price data: OHLCV bars from CSV, or a synthetic series for tests."""

from __future__ import annotations

import csv
import math
import random
from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class Bar:
    ts: str  # ISO date or datetime, e.g. "2024-01-02"
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

    @property
    def day(self) -> str:
        return self.ts[:10]

    @property
    def month(self) -> str:
        return self.ts[:7]


def load_csv(path: str) -> list[Bar]:
    """Load bars from a CSV with columns date/timestamp, open, high, low, close[, volume].

    Rows are sorted by timestamp. Header names are case-insensitive.
    """
    bars: list[Bar] = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            r = {k.strip().lower(): v for k, v in row.items() if k}
            ts = r.get("date") or r.get("timestamp") or r.get("time")
            if not ts:
                raise ValueError("CSV needs a date/timestamp column")
            bars.append(
                Bar(
                    ts=ts.strip(),
                    open=float(r["open"]),
                    high=float(r["high"]),
                    low=float(r["low"]),
                    close=float(r["close"]),
                    volume=float(r.get("volume") or 0),
                )
            )
    bars.sort(key=lambda b: b.ts)
    return bars


def synthetic_bars(
    n: int = 756,
    start_price: float = 100.0,
    annual_drift: float = 0.07,
    annual_vol: float = 0.18,
    seed: int = 7,
    start: date = date(2020, 1, 1),
) -> list[Bar]:
    """Geometric-Brownian-motion daily bars (weekdays only). For tests and demos, not research."""
    rng = random.Random(seed)
    mu = annual_drift / 252
    sigma = annual_vol / math.sqrt(252)
    bars: list[Bar] = []
    price = start_price
    d = start
    while len(bars) < n:
        if d.weekday() < 5:
            o = price * (1 + rng.gauss(0, sigma / 4))
            c = o * math.exp(mu - 0.5 * sigma**2 + sigma * rng.gauss(0, 1))
            h = max(o, c) * (1 + abs(rng.gauss(0, sigma / 2)))
            lo = min(o, c) * (1 - abs(rng.gauss(0, sigma / 2)))
            bars.append(Bar(d.isoformat(), o, h, lo, c, 1_000_000))
            price = c
        d += timedelta(days=1)
    return bars
