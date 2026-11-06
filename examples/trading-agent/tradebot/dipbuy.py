"""Buy-the-panic-dip study: do the biggest losers of a sell-off bounce back?

Rules fixed before testing (2026-11-06):
* Universe: ~60 large, well-known U.S. companies (today's list, so survivorship
  bias favours recovery; treat results as optimistic).
* Losers: the 10 stocks with the worst return over the sell-off window.
* Entry: next trading day's open after the window. Hold 20 and 60 trading days.
* Compare: losers (equal weight) vs. SPY and vs. all stocks (equal weight).
* Events: (a) past U.S. elections, window = close before Election Day to the close
  two days after; (b) every SPY one-day drop of 3% or more since 2016, at least
  20 trading days apart, window = that day.

Usage:
    python3 -m tradebot.dipbuy --data DIR
"""

from __future__ import annotations

import argparse
import os

from .data import load_csv

ETFS = {"SPY", "XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU", "VOO", "QQQ", "SGOV"}
PAST_ELECTIONS = ("2016-11-08", "2018-11-06", "2020-11-03", "2022-11-08", "2024-11-05")
N_LOSERS = 10
HORIZONS = (20, 60)


def load_universe(path: str) -> dict[str, dict[str, tuple[float, float]]]:
    """symbol -> {date: (open, close)}"""
    out = {}
    for f in sorted(os.listdir(path)):
        if f.endswith(".csv"):
            out[f[:-4]] = {b.ts: (b.open, b.close) for b in load_csv(os.path.join(path, f))}
    return out


def window_return(px, sym, d0, d1):
    a, b = px[sym].get(d0), px[sym].get(d1)
    return b[1] / a[1] - 1 if a and b else None


def hold_return(px, sym, dates, entry_i, h):
    if entry_i + h >= len(dates):
        return None
    a, b = px[sym].get(dates[entry_i]), px[sym].get(dates[entry_i + h - 1])
    return b[1] / a[0] - 1 if a and b else None


def rank_losers(px, stocks, d0, d1, n=N_LOSERS):
    rets = [(window_return(px, s, d0, d1), s) for s in stocks]
    rets = sorted((r, s) for r, s in rets if r is not None)
    return rets[:n], rets


def evaluate(px, dates, stocks, d0, d1):
    """Losers vs SPY vs all-stocks for one event; None if forward data is missing."""
    losers, _ = rank_losers(px, stocks, d0, d1)
    i1 = dates.index(d1)
    res = {"start": d0, "end": d1, "losers": [s for _, s in losers],
           "spy_drop": window_return(px, "SPY", d0, d1)}
    for h in HORIZONS:
        lr = [hold_return(px, s, dates, i1 + 1, h) for _, s in losers]
        ar = [hold_return(px, s, dates, i1 + 1, h) for s in stocks]
        spy = hold_return(px, "SPY", dates, i1 + 1, h)
        lr, ar = [r for r in lr if r is not None], [r for r in ar if r is not None]
        if spy is None or not lr:
            res[h] = None
            continue
        res[h] = {"losers": sum(lr) / len(lr), "all": sum(ar) / len(ar), "spy": spy}
    return res


def big_drop_days(px, dates, threshold=-0.03, gap=20):
    out, last = [], -10**9
    for i in range(1, len(dates)):
        a, b = px["SPY"].get(dates[i - 1]), px["SPY"].get(dates[i])
        if a and b and b[1] / a[1] - 1 <= threshold and i - last >= gap:
            out.append((dates[i - 1], dates[i]))
            last = i
    return out


def summarize(results, h):
    rows = [r[h] for r in results if r.get(h)]
    if not rows:
        return None
    n = len(rows)
    return {
        "events": n,
        "losers_avg": sum(r["losers"] for r in rows) / n,
        "all_avg": sum(r["all"] for r in rows) / n,
        "spy_avg": sum(r["spy"] for r in rows) / n,
        "losers_beat_spy": sum(r["losers"] > r["spy"] for r in rows) / n,
        "losers_beat_all": sum(r["losers"] > r["all"] for r in rows) / n,
    }


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data", required=True)
    a = p.parse_args(argv)
    px = load_universe(a.data)
    dates = sorted(px["SPY"])
    stocks = [s for s in px if s not in ETFS]
    print(f"Universe: {len(stocks)} stocks, {dates[0]}..{dates[-1]}")

    # 2026 election sell-off (election Tue 2026-11-03)
    d0, d1 = "2026-11-02", "2026-11-05"
    losers, allr = rank_losers(px, stocks, d0, d1, n=15)
    print(f"\n2026 election window {d0} close -> {d1} close; "
          f"SPY {window_return(px, 'SPY', d0, d1):+.1%}")
    for r, s in losers:
        day = window_return(px, s, "2026-11-04", d1)
        print(f"  {s:<6} {r:+6.1%}  (Nov 5 alone {day:+.1%})")
    print("  Sectors:", ", ".join(f"{e} {window_return(px, e, d0, d1):+.1%}"
                                  for e in ("XLK", "XLY", "XLF", "XLE", "XLV", "XLI",
                                            "XLP", "XLU")))

    for label, events in (
        ("Past elections", [(dates[dates.index(e) - 1], dates[dates.index(e) + 2])
                            for e in PAST_ELECTIONS if e in dates]),
        ("SPY one-day drops of 3% or more", big_drop_days(px, dates)),
    ):
        results = [evaluate(px, dates, stocks, s, e) for s, e in events]
        print(f"\n{label}: {len(results)} events")
        for r in results:
            if label.startswith("Past"):
                h = r.get(60)
                print(f"  {r['end']}: SPY window {r['spy_drop']:+.1%}; 60d losers "
                      f"{h['losers']:+.1%} vs SPY {h['spy']:+.1%}" if h else f"  {r['end']}")
        for h in HORIZONS:
            s = summarize(results, h)
            if s:
                print(f"  hold {h}d: losers {s['losers_avg']:+.1%}  all {s['all_avg']:+.1%}  "
                      f"SPY {s['spy_avg']:+.1%}  | losers beat SPY {s['losers_beat_spy']:.0%}, "
                      f"beat all {s['losers_beat_all']:.0%}  (n={s['events']})")
    print("\nPrice-only, no costs, survivorship-biased universe. Not a guarantee.")


if __name__ == "__main__":
    main()
