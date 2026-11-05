"""Event-driven backtester with next-bar-open fills, stops, costs and risk limits.

Usage:
    python3 -m tradebot.backtest --synthetic
    python3 -m tradebot.backtest --csv spy.csv --symbol SPY --target 2000 --cash 100000
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass, field

from .broker import Order, PaperBroker, client_order_id
from .data import Bar, load_csv, synthetic_bars
from .goal import capital_required
from .journal import Journal
from .risk import RiskLimits, RiskManager
from .strategy import SmaCrossover, Strategy


@dataclass
class BacktestResult:
    equity_curve: list[tuple[str, float]]
    trades: list[dict]
    risk_events: list[dict]
    metrics: dict = field(default_factory=dict)
    monthly_pnl: dict[str, float] = field(default_factory=dict)


def split_bars(bars: list[Bar], in_sample_frac: float = 0.7) -> tuple[list[Bar], list[Bar]]:
    """Chronological in-sample / out-of-sample split. Touch the OOS part once."""
    k = int(len(bars) * in_sample_frac)
    return bars[:k], bars[k:]


def run_backtest(
    bars: list[Bar],
    strategy: Strategy,
    initial_cash: float = 100_000.0,
    limits: RiskLimits | None = None,
    commission: float = 1.0,
    slippage_bps: float = 5.0,
    symbol: str = "SYM",
    periods_per_year: int = 252,
    monthly_target: float | None = None,
    journal_path: str | None = None,
) -> BacktestResult:
    if len(bars) < 2:
        raise ValueError("need at least 2 bars")
    journal = Journal(journal_path)
    risk = RiskManager(limits)
    broker = PaperBroker(initial_cash, commission, slippage_bps, journal)
    slip = slippage_bps / 10_000

    pending: tuple[Order, float | None] | None = None  # (order, stop_distance)
    stop_price: float | None = None
    open_trade: dict | None = None
    trades: list[dict] = []
    curve: list[tuple[str, float]] = []
    equity = initial_cash

    def close_trade(fill, reason: str) -> None:
        nonlocal open_trade, stop_price
        if fill and open_trade:
            pnl = (fill.price - open_trade["entry"]) * open_trade["qty"] - 2 * commission
            open_trade.update(exit=fill.price, exit_ts=fill.ts, pnl=pnl, reason=reason,
                              ret=pnl / open_trade["equity_at_entry"])
            trades.append(open_trade)
            open_trade, stop_price = None, None

    for i, bar in enumerate(bars):
        risk.start_day(bar.day, equity)

        # 1) Fill the order decided at the previous close, at this bar's open.
        if pending:
            order, stop_dist = pending
            pending = None
            pos = broker.position(symbol)
            eq_open = broker.equity({symbol: bar.open})
            qty = order.qty
            if order.side == "buy":  # re-size for overnight gaps
                qty = min(qty, risk.position_size(eq_open, bar.open * (1 + slip), stop_dist))
            if qty > 0:
                ok, reason = risk.approve_order(order.side, qty, bar.open * (1 + slip),
                                                eq_open, pos * bar.open)
                journal.log("risk_decision", id=order.client_order_id, ok=ok, reason=reason)
                if ok:
                    order = Order(order.symbol, order.side, qty, order.client_order_id)
                    fill = broker.submit(order, bar.open, bar.ts)
                    if fill and order.side == "buy":
                        stop_price = fill.price - stop_dist if stop_dist else None
                        open_trade = {"entry": fill.price, "entry_ts": bar.ts, "qty": qty,
                                      "equity_at_entry": eq_open}
                    elif order.side == "sell":
                        close_trade(fill, "signal")

        # 2) Protective stop (resting order, may fill intrabar).
        pos = broker.position(symbol)
        if pos > 0 and stop_price is not None and bar.low <= stop_price:
            px = min(bar.open, stop_price)
            sell = Order(symbol, "sell", pos, client_order_id(strategy.name, symbol, bar.ts, "stop"))
            close_trade(broker.submit(sell, px, bar.ts), "stop")

        # 3) Mark to market and update risk state.
        equity = broker.equity({symbol: bar.close})
        risk.on_equity(equity)
        curve.append((bar.ts, equity))
        if i == len(bars) - 1:
            break

        # 4) Decide at the close; fill next bar.
        pos = broker.position(symbol)
        if not risk.trading_allowed:
            desired, stop_dist = 0, None
        else:
            sig = strategy.signal(bars[: i + 1])
            desired, stop_dist = sig.target, sig.stop_distance
        if desired == 0 and pos > 0:
            pending = (Order(symbol, "sell", pos,
                             client_order_id(strategy.name, symbol, bar.ts, "sell")), None)
        elif desired == 1 and pos == 0:
            qty = risk.position_size(equity, bar.close, stop_dist)
            if qty > 0:
                pending = (Order(symbol, "buy", qty,
                                 client_order_id(strategy.name, symbol, bar.ts, "buy")), stop_dist)

    result = BacktestResult(curve, trades, risk.events)
    result.monthly_pnl = monthly_pnl(curve, initial_cash)
    result.metrics = compute_metrics(curve, trades, periods_per_year, result.monthly_pnl,
                                     monthly_target, initial_cash)
    return result


def monthly_pnl(curve: list[tuple[str, float]], initial_cash: float) -> dict[str, float]:
    out: dict[str, float] = {}
    prev_end = initial_cash
    month_end: dict[str, float] = {}
    for ts, eq in curve:
        month_end[ts[:7]] = eq
    for m in sorted(month_end):
        out[m] = month_end[m] - prev_end
        prev_end = month_end[m]
    return out


def max_drawdown(values: list[float]) -> float:
    peak, mdd = -math.inf, 0.0
    for v in values:
        peak = max(peak, v)
        if peak > 0:
            mdd = max(mdd, 1 - v / peak)
    return mdd


def compute_metrics(curve, trades, periods_per_year, monthly, monthly_target, initial_cash) -> dict:
    eq = [e for _, e in curve]
    rets = [eq[i] / eq[i - 1] - 1 for i in range(1, len(eq)) if eq[i - 1] > 0]
    n = len(rets)
    mean = sum(rets) / n if n else 0.0
    std = math.sqrt(sum((r - mean) ** 2 for r in rets) / (n - 1)) if n > 1 else 0.0
    total = eq[-1] / initial_cash - 1
    years = n / periods_per_year if n else 0
    cagr = (eq[-1] / initial_cash) ** (1 / years) - 1 if years > 0 and eq[-1] > 0 else 0.0
    wins = [t for t in trades if t["pnl"] > 0]
    m = {
        "start_equity": initial_cash,
        "end_equity": eq[-1],
        "total_return": total,
        "cagr": cagr,
        "avg_monthly_return": (1 + cagr) ** (1 / 12) - 1 if cagr > -1 else -1.0,
        "sharpe": mean / std * math.sqrt(periods_per_year) if std > 0 else 0.0,
        "max_drawdown": max_drawdown(eq),
        "trades": len(trades),
        "win_rate": len(wins) / len(trades) if trades else 0.0,
        "avg_monthly_pnl": sum(monthly.values()) / len(monthly) if monthly else 0.0,
    }
    if monthly_target is not None:
        hit = [v for v in monthly.values() if v >= monthly_target]
        m["monthly_target"] = monthly_target
        m["pct_months_meeting_target"] = len(hit) / len(monthly) if monthly else 0.0
        if m["avg_monthly_return"] > 0:
            m["capital_needed_at_this_return"] = capital_required(
                monthly_target, m["avg_monthly_return"])
    return m


def format_report(name: str, r: BacktestResult) -> str:
    m = r.metrics
    lines = [
        f"BACKTEST: {name}",
        f"  Equity        ${m['start_equity']:,.0f} -> ${m['end_equity']:,.0f}"
        f"  ({m['total_return']:+.1%})",
        f"  CAGR          {m['cagr']:+.2%}   (~{m['avg_monthly_return']:+.2%}/mo)",
        f"  Sharpe        {m['sharpe']:.2f}",
        f"  Max drawdown  {m['max_drawdown']:.1%}",
        f"  Trades        {m['trades']}  win rate {m['win_rate']:.0%}"
        + ("   (<100 trades: not statistically meaningful)" if m["trades"] < 100 else ""),
        f"  Avg month P&L ${m['avg_monthly_pnl']:,.0f}",
        f"  Risk events   {len(r.risk_events)}",
    ]
    if "monthly_target" in m:
        lines.append(f"  Months >= ${m['monthly_target']:,.0f}: {m['pct_months_meeting_target']:.0%}")
        if "capital_needed_at_this_return" in m:
            lines.append(f"  Capital needed for target at this return: "
                         f"${m['capital_needed_at_this_return']:,.0f}")
    lines.append("  Backtested results do not guarantee future returns.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="Backtest the example strategy")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv")
    src.add_argument("--synthetic", action="store_true")
    p.add_argument("--symbol", default="SYM")
    p.add_argument("--cash", type=float, default=100_000)
    p.add_argument("--target", type=float, help="monthly $ target")
    p.add_argument("--fast", type=int, default=20)
    p.add_argument("--slow", type=int, default=100)
    p.add_argument("--commission", type=float, default=1.0)
    p.add_argument("--slippage-bps", type=float, default=5.0)
    p.add_argument("--journal", help="write JSONL journal to this path")
    a = p.parse_args(argv)

    bars = synthetic_bars() if a.synthetic else load_csv(a.csv)
    strat = SmaCrossover(a.fast, a.slow)
    ins, oos = split_bars(bars)
    for label, data, costs in (("in-sample", ins, 1), ("out-of-sample", oos, 1),
                               ("out-of-sample 2x costs", oos, 2)):
        r = run_backtest(data, strat, a.cash, commission=a.commission * costs,
                         slippage_bps=a.slippage_bps * costs, symbol=a.symbol,
                         monthly_target=a.target,
                         journal_path=a.journal if label == "out-of-sample" else None)
        print(format_report(f"{strat.name} {a.symbol} [{label}]", r))
        print()


if __name__ == "__main__":
    main()
