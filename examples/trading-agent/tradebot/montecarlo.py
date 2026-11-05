"""Monte Carlo risk of ruin: resample backtest trade returns."""

from __future__ import annotations

import random


def resample_drawdowns(
    trade_returns: list[float],
    trades_per_year: int,
    n_sims: int = 10_000,
    kill_drawdown: float = 0.15,
    seed: int = 1,
) -> dict:
    """Bootstrap one year of trades ``n_sims`` times.

    ``trade_returns`` are per-trade P&L as a fraction of equity at entry
    (``BacktestResult.trades[i]['ret']``). Returns the median and 95th-percentile
    (bad case) max drawdown and the probability of hitting ``kill_drawdown``.
    """
    if not trade_returns:
        raise ValueError("no trades to resample")
    if trades_per_year < 1:
        raise ValueError("trades_per_year must be >= 1")
    rng = random.Random(seed)
    dds, hits = [], 0
    for _ in range(n_sims):
        eq = peak = 1.0
        mdd = 0.0
        for _ in range(trades_per_year):
            eq *= 1 + rng.choice(trade_returns)
            peak = max(peak, eq)
            mdd = max(mdd, 1 - eq / peak)
        dds.append(mdd)
        hits += mdd >= kill_drawdown
    dds.sort()
    return {
        "median_max_drawdown": dds[len(dds) // 2],
        "p95_max_drawdown": dds[int(len(dds) * 0.95) - 1],
        "prob_kill_switch_12m": hits / n_sims,
    }
