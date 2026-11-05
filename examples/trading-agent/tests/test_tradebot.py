import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tradebot import goal  # noqa: E402
from tradebot.backtest import max_drawdown, run_backtest, split_bars  # noqa: E402
from tradebot.broker import LiveBroker, Order, PaperBroker, client_order_id  # noqa: E402
from tradebot.data import Bar, load_csv, synthetic_bars  # noqa: E402
from tradebot.montecarlo import resample_drawdowns  # noqa: E402
from tradebot.risk import RiskLimits, RiskManager  # noqa: E402
from tradebot.strategy import Signal, SmaCrossover, Strategy  # noqa: E402


class GoalTests(unittest.TestCase):
    def test_capital_required(self):
        self.assertAlmostEqual(goal.capital_required(2000, 0.01), 200_000)
        self.assertAlmostEqual(goal.capital_required(2_000_000, 0.02), 100_000_000)

    def test_implied_and_classify(self):
        r = goal.implied_monthly_return(2000, 50_000)
        self.assertAlmostEqual(r, 0.04)
        self.assertEqual(goal.classify(r), "unrealistic")
        self.assertEqual(goal.classify(0.008), "plausible")
        self.assertEqual(goal.classify(0.02), "aggressive")

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            goal.capital_required(2000, 0)
        with self.assertRaises(ValueError):
            goal.implied_monthly_return(2000, 0)

    def test_report_never_promises(self):
        text = goal.report(2_000_000, 50_000)
        self.assertIn("UNREALISTIC", text)
        self.assertIn("No strategy guarantees", text)


class RiskTests(unittest.TestCase):
    def test_position_size_respects_all_caps(self):
        rm = RiskManager(RiskLimits(risk_per_trade=0.01, max_position_pct=0.2))
        # risk cap: 100k*1%/2 = 500 sh; position cap: 20k/100 = 200 sh
        self.assertEqual(rm.position_size(100_000, 100, 2.0), 200)
        # risk cap binds: 100k*1%/20 = 50 sh
        self.assertEqual(rm.position_size(100_000, 100, 20.0), 50)
        self.assertEqual(rm.position_size(0, 100, 2.0), 0)

    def test_kill_switch_trips_and_blocks_buys_but_allows_sells(self):
        rm = RiskManager(RiskLimits(max_drawdown=0.10))
        rm.start_day("2024-01-01", 100_000)
        rm.on_equity(89_000)
        self.assertTrue(rm.killed)
        self.assertFalse(rm.trading_allowed)
        self.assertFalse(rm.approve_order("buy", 1, 10, 89_000, 0)[0])
        self.assertTrue(rm.approve_order("sell", 1, 10, 89_000, 10)[0])
        # kill switch persists across days
        rm.start_day("2024-01-02", 95_000)
        self.assertTrue(rm.killed)

    def test_kill_switch_reset_requires_human_phrase(self):
        rm = RiskManager()
        rm.killed = True
        with self.assertRaises(PermissionError):
            rm.reset_kill_switch("yes")
        rm.reset_kill_switch("I have reviewed the drawdown and accept the risk")
        self.assertFalse(rm.killed)

    def test_daily_loss_halt_resets_next_day(self):
        rm = RiskManager(RiskLimits(daily_loss_limit=0.02, max_drawdown=0.5))
        rm.start_day("2024-01-01", 100_000)
        rm.on_equity(97_500)
        self.assertTrue(rm.halted_today)
        self.assertFalse(rm.approve_order("buy", 1, 10, 97_500, 0)[0])
        rm.start_day("2024-01-02", 97_500)
        self.assertTrue(rm.trading_allowed)

    def test_exposure_and_order_limits(self):
        rm = RiskManager(RiskLimits(max_position_pct=0.2, max_gross_exposure=0.5,
                                    max_orders_per_day=2))
        rm.start_day("2024-01-01", 100_000)
        self.assertFalse(rm.approve_order("buy", 300, 100, 100_000, 0)[0])  # 30% > 20%
        self.assertFalse(rm.approve_order("buy", 150, 100, 100_000, 40_000)[0])  # gross 55%
        self.assertTrue(rm.approve_order("buy", 100, 100, 100_000, 0)[0])
        self.assertTrue(rm.approve_order("buy", 100, 100, 100_000, 10_000)[0])
        self.assertFalse(rm.approve_order("buy", 1, 100, 100_000, 20_000)[0])  # order cap

    def test_invalid_limits(self):
        with self.assertRaises(ValueError):
            RiskLimits(risk_per_trade=1.5)
        with self.assertRaises(ValueError):
            RiskLimits(max_gross_exposure=10)


class BrokerTests(unittest.TestCase):
    def test_paper_fill_slippage_and_idempotency(self):
        b = PaperBroker(10_000, commission_per_order=1, slippage_bps=10)
        o = Order("SPY", "buy", 10, client_order_id("s", "SPY", "2024-01-02", "buy"))
        f = b.submit(o, 100, "2024-01-02")
        self.assertAlmostEqual(f.price, 100.1)
        self.assertIsNone(b.submit(o, 100, "2024-01-02"))  # duplicate ignored
        self.assertEqual(b.position("SPY"), 10)
        self.assertAlmostEqual(b.cash, 10_000 - 1001 - 1)

    def test_paper_rejects_oversell_and_insufficient_cash(self):
        b = PaperBroker(100)
        self.assertIsNone(b.submit(Order("X", "buy", 10, "a"), 100, "t"))
        with self.assertRaises(ValueError):
            b.submit(Order("X", "sell", 1, "b"), 100, "t")

    def test_live_broker_fails_closed(self):
        lb = LiveBroker(approve=lambda o, p: True)
        o = Order("SPY", "buy", 1, "id")
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(PermissionError):
                lb.submit(o, 100, "t")
        declined = LiveBroker(approve=lambda o, p: False)
        with mock.patch.dict(os.environ, {"TRADEBOT_LIVE": "1"}):
            self.assertIsNone(declined.submit(o, 100, "t"))
            with self.assertRaises(NotImplementedError):
                lb.submit(o, 100, "t")


class LookaheadSpy(Strategy):
    name = "spy"

    def __init__(self):
        self.seen_lengths = []

    def signal(self, history):
        self.seen_lengths.append(len(history))
        return Signal(1, 1.0)


class BacktestTests(unittest.TestCase):
    def test_no_lookahead_and_next_open_fill(self):
        closes = [100 + i for i in range(10)]
        bars = [Bar(f"2024-01-{i + 1:02d}", c - 0.5, c + 1, c - 1, c) for i, c in enumerate(closes)]
        spy = LookaheadSpy()
        r = run_backtest(bars, spy, 100_000, commission=0, slippage_bps=0)
        # strategy only ever sees bars up to the current one
        self.assertEqual(spy.seen_lengths, list(range(1, len(bars))))
        # first buy is decided at bar[0] close and fills at bar[1].open
        self.assertEqual(r.risk_events, [])
        entry = r.trades[0] if r.trades else None
        self.assertIsNone(entry)  # never exits: always-long strategy, rising prices
        self.assertEqual(r.equity_curve[0][1], 100_000)  # nothing filled on bar 0
        broker_fill_open = bars[1].open
        held_value = r.equity_curve[1][1] - 100_000
        shares = round(held_value / (bars[1].close - broker_fill_open))
        self.assertGreater(shares, 0)

    def test_stop_loss_exits(self):
        closes = [100] * 5 + [80] * 5
        bars = [Bar(f"2024-01-{i + 1:02d}", c, c + 0.5, c - 0.5, c) for i, c in enumerate(closes)]
        r = run_backtest(bars, LookaheadSpy(), 100_000, commission=0, slippage_bps=0)
        self.assertTrue(any(t["reason"] == "stop" for t in r.trades))
        # 1% risk per trade with a $1 stop, capped at 20% position => loss bounded
        self.assertLess(r.metrics["max_drawdown"], 0.21)

    def test_synthetic_run_metrics(self):
        bars = synthetic_bars(400, seed=3)
        r = run_backtest(bars, SmaCrossover(10, 50), 50_000, monthly_target=2000)
        for k in ("cagr", "sharpe", "max_drawdown", "trades", "pct_months_meeting_target"):
            self.assertIn(k, r.metrics)
        self.assertEqual(len(r.equity_curve), 400)
        self.assertGreaterEqual(r.metrics["max_drawdown"], 0)

    def test_kill_switch_in_backtest_stops_new_entries(self):
        closes = [100] * 3 + [50] * 10
        bars = [Bar(f"2024-01-{i + 1:02d}", c, c, c, c) for i, c in enumerate(closes)]
        limits = RiskLimits(max_position_pct=0.9, risk_per_trade=0.9, max_drawdown=0.10)
        r = run_backtest(bars, LookaheadSpy(), 100_000, limits=limits, commission=0,
                         slippage_bps=0)
        self.assertTrue(any(e["event"] == "kill_switch" for e in r.risk_events))
        self.assertLessEqual(len(r.trades), 1)

    def test_split_and_drawdown_helpers(self):
        ins, oos = split_bars(list(range(10)), 0.7)
        self.assertEqual((len(ins), len(oos)), (7, 3))
        self.assertAlmostEqual(max_drawdown([100, 120, 90, 130]), 0.25)


class DataAndMonteCarloTests(unittest.TestCase):
    def test_load_csv(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write("Date,Open,High,Low,Close,Volume\n2024-01-03,2,3,1,2.5,10\n2024-01-02,1,2,1,1.5,5\n")
        try:
            bars = load_csv(f.name)
        finally:
            os.unlink(f.name)
        self.assertEqual([b.ts for b in bars], ["2024-01-02", "2024-01-03"])
        self.assertEqual(bars[1].close, 2.5)

    def test_montecarlo(self):
        res = resample_drawdowns([0.01, -0.01, 0.02, -0.015], 50, n_sims=500)
        self.assertGreaterEqual(res["p95_max_drawdown"], res["median_max_drawdown"])
        self.assertTrue(0 <= res["prob_kill_switch_12m"] <= 1)
        with self.assertRaises(ValueError):
            resample_drawdowns([], 10)


if __name__ == "__main__":
    unittest.main()
