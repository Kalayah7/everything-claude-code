import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tradebot.data import Bar  # noqa: E402
from tradebot.rotation import decide, run_rotation  # noqa: E402


def series(start, step, n, y=2024):
    out, p, day = [], start, 0
    for m in range(1, 13):
        for d in range(1, 22):
            if len(out) >= n:
                return out
            out.append(Bar(f"{y}-{m:02d}-{d:02d}", p, p, p, p))
            p += step
            day += 1
    return out


class DecideTests(unittest.TestCase):
    def test_trend_above_and_below_sma(self):
        up = [100 + i for i in range(250)]
        down = [400 - i for i in range(250)]
        self.assertEqual(decide("trend", {"VOO": up}), "VOO")
        self.assertEqual(decide("trend", {"VOO": down}), "SGOV")
        self.assertEqual(decide("trend", {"VOO": up[:50]}), "SGOV")  # not enough data

    def test_dual_mom_picks_stronger_or_cash(self):
        voo = [100 + i for i in range(250)]
        qqq = [100 + 2 * i for i in range(250)]
        self.assertEqual(decide("dual_mom", {"VOO": voo, "QQQ": qqq}), "QQQ")
        falling = [400 - i for i in range(250)]
        self.assertEqual(decide("dual_mom", {"VOO": falling, "QQQ": falling}), "SGOV")

    def test_buy_hold_and_unknown(self):
        self.assertEqual(decide("buy_hold", {}), "VOO")
        with self.assertRaises(ValueError):
            decide("magic", {})


class RunRotationTests(unittest.TestCase):
    def test_buy_hold_tracks_price_and_never_loses_value_on_switch(self):
        bars = {"VOO": series(100, 1, 200), "QQQ": series(100, 1, 200),
                "SGOV": series(100, 0, 200)}
        r = run_rotation("buy_hold", bars, start_cash=20, slippage_bps=0)
        self.assertEqual(r.switches, 1)
        # bought at day-2 open (101) -> final close 299
        self.assertAlmostEqual(r.equity[-1][1], 20 / 101 * 299, places=6)

    def test_missing_price_defers_switch_instead_of_zeroing(self):
        voo = series(100, 1, 120)
        sgov = [b for b in series(100, 0, 120) if b.ts[5:7] != "02"]  # Feb missing
        r = run_rotation("trend", {"VOO": voo, "QQQ": voo, "SGOV": sgov}, start_cash=20)
        self.assertTrue(all(v > 0 for _, v in r.equity))


if __name__ == "__main__":
    unittest.main()
