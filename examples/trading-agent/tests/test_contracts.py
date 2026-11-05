import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tradebot.contracts import (event_returns, parse_amount, parse_announcement,  # noqa: E402
                                summarize)
from tradebot.data import Bar  # noqa: E402

SAMPLE = """ARMY

Acme Robotics Inc., Huntsville, Alabama, was awarded a $48,500,000 firm-fixed-price contract for unmanned ground vehicles. Work will be performed in Huntsville, Alabama.

Big Prime Corp., Fort Worth, Texas, has been awarded a $1.2 billion modification to a previously awarded contract.

*Small business

This line is not an award and mentions $5,000,000 only in passing.
"""


def day_bars(day, open_, close, n=78):
    step = (close - open_) / (n - 1)
    return [Bar(f"{day}T{13 + i // 12:02d}:{(i % 12) * 5:02d}:00Z",
                open_ + step * i, open_ + step * i, open_ + step * i, open_ + step * i)
            for i in range(n)]


class ParseTests(unittest.TestCase):
    def test_amounts(self):
        self.assertEqual(parse_amount("a $48,500,000 contract"), 48_500_000)
        self.assertEqual(parse_amount("a $1.2 billion modification"), 1.2e9)
        self.assertIsNone(parse_amount("no money here"))

    def test_announcement(self):
        awards = parse_announcement(SAMPLE)
        self.assertEqual([a.company for a in awards], ["Acme Robotics Inc.", "Big Prime Corp."])
        self.assertEqual(awards[0].amount, 48_500_000)


class EventTests(unittest.TestCase):
    def test_overnight_morning_and_excess(self):
        stock = day_bars("2026-10-01", 10, 10) + day_bars("2026-10-02", 11, 12)
        spy = day_bars("2026-10-01", 100, 100) + day_bars("2026-10-02", 100, 100)
        r = event_returns("ACME", "2026-10-01", stock, spy, 48.5e6, 200e6)
        self.assertAlmostEqual(r.overnight, 0.10)
        self.assertAlmostEqual(r.overnight_excess, 0.10)
        self.assertAlmostEqual(r.day, 12 / 11 - 1)
        self.assertGreater(r.morning, 0)
        self.assertAlmostEqual(r.award_to_mcap, 0.2425)
        s = summarize([r], min_award_to_mcap=0.05)
        self.assertEqual(s["events"], 1)
        self.assertEqual(summarize([r], min_award_to_mcap=0.5)["events"], 0)

    def test_missing_next_day_returns_none(self):
        stock = day_bars("2026-10-01", 10, 10)
        self.assertIsNone(event_returns("ACME", "2026-10-01", stock, stock))


if __name__ == "__main__":
    unittest.main()
