import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tradebot.data import Bar  # noqa: E402
from tradebot.intraday import run, simulate_day, summarize  # noqa: E402


def day(prices, d="2026-11-05", lows=None, highs=None):
    out = []
    for i, p in enumerate(prices):
        lo = lows[i] if lows else p
        hi = highs[i] if highs else p
        out.append(Bar(f"{d}T{13 + i // 12:02d}:{(i % 12) * 5:02d}:00Z", p, hi, lo, p, 100))
    return out


class IntradayTests(unittest.TestCase):
    def test_momentum_hits_take_profit_at_2r(self):
        prices = [100] * 11 + [100.5] + [100.6] * 3 + [102] + [102] * 62
        t = simulate_day("momentum", day(prices), 0.0)
        self.assertEqual(t.reason, "target")
        self.assertAlmostEqual(t.target - t.entry, 2 * (t.entry - t.stop))

    def test_stop_first_when_bar_touches_both(self):
        prices = [100] * 11 + [100.5] + [100.6] * 66
        lows = [p for p in prices]
        highs = [p for p in prices]
        lows[13], highs[13] = 99.0, 103.0  # one bar touches both
        t = simulate_day("momentum", day(prices, lows=lows, highs=highs), 0.0)
        self.assertEqual(t.reason, "stop")

    def test_no_signal_no_trade_and_flat_close(self):
        self.assertIsNone(simulate_day("momentum", day([100] * 78), 0.0))
        prices = [100] * 11 + [100.5] + [100.6] * 66
        t = simulate_day("momentum", day(prices), 0.0)
        self.assertEqual(t.reason, "close")

    def test_pdt_limit_caps_three_per_five_days(self):
        prices = [100] * 11 + [100.5] + [100.6] * 66
        bars = []
        for k in range(10):
            bars += day(prices, d=f"2026-10-{10 + k:02d}")
        self.assertEqual(len(run("momentum", bars, 0, pdt_limit=False)), 10)
        self.assertEqual(len(run("momentum", bars, 0, pdt_limit=True)), 6)
        self.assertAlmostEqual(summarize(run("momentum", bars, 0), 5.0)["end_cash"], 5.0)


if __name__ == "__main__":
    unittest.main()
