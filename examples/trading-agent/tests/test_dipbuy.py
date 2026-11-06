import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tradebot.dipbuy import big_drop_days, evaluate, rank_losers  # noqa: E402

DATES = [f"2026-01-{d:02d}" for d in range(1, 31)] + [f"2026-02-{d:02d}" for d in range(1, 29)] \
    + [f"2026-03-{d:02d}" for d in range(1, 31)]


def flat(p):
    return {d: (p, p) for d in DATES}


class DipTests(unittest.TestCase):
    def test_rank_losers_orders_worst_first(self):
        px = {"A": flat(10), "B": flat(10), "SPY": flat(100)}
        px["A"]["2026-01-02"] = (8, 8)
        losers, _ = rank_losers(px, ["A", "B"], "2026-01-01", "2026-01-02", n=1)
        self.assertEqual(losers[0][1], "A")
        self.assertAlmostEqual(losers[0][0], -0.2)

    def test_big_drop_days_respects_gap(self):
        px = {"SPY": flat(100)}
        for d in DATES[5:]:
            px["SPY"][d] = (96, 96)
        for d in DATES[6:]:
            px["SPY"][d] = (92, 92)
        days = big_drop_days(px, DATES, -0.03, gap=20)
        self.assertEqual(days, [(DATES[4], DATES[5])])

    def test_evaluate_buys_next_open(self):
        px = {"A": flat(10), "SPY": flat(100)}
        for d in DATES[3:]:
            px["A"][d] = (12, 12)
        r = evaluate(px, DATES, ["A"], DATES[0], DATES[1])
        self.assertAlmostEqual(r[20]["losers"], 12 / 10 - 1)
        self.assertAlmostEqual(r[20]["spy"], 0.0)


if __name__ == "__main__":
    unittest.main()
