# Trading Agent Starter (`tradebot`)

A small, dependency-free Python starter that the `/trading-team` agents extend into your own
trading agent. It is built to keep you from losing money while you test ideas.

> **Not financial advice. No returns are guaranteed.** Most automated strategies fail
> out-of-sample. The example strategy only shows how the pieces fit together. It has no proven edge.

## Step 1: Do the goal math

```bash
python3 -m tradebot.goal --target 2000 --capital 50000
```

`capital_required = monthly_target / monthly_return`. For **$2,000/month** you need about
$200k at 1%/mo (a strong, sustained result) or $100k at 2%/mo (elite). For
**$2,000,000/month** you need $100M–$200M. If your capital is far below that, set an interim
target. Raising leverage does not close the gap; it raises your chance of ruin.

## Step 2: Backtest

```bash
python3 -m tradebot.backtest --synthetic --target 2000          # demo data
python3 -m tradebot.backtest --csv SPY.csv --symbol SPY --cash 100000 --target 2000
```

Each run prints in-sample, out-of-sample, and out-of-sample at 2× costs. The CSV needs these columns:
`date,open,high,low,close[,volume]`.

## Step 3: Test

```bash
python3 -m unittest discover -s tests
```

## What's inside

| Module | Purpose |
|---|---|
| `goal.py` | Capital-required / implied-return math, realism classification |
| `data.py` | `Bar`, CSV loader, synthetic GBM data for tests |
| `strategy.py` | `Strategy` interface, `SmaCrossover` example, SMA/ATR helpers |
| `risk.py` | `RiskLimits` + `RiskManager`: sizing, exposure caps, daily-loss halt, drawdown kill switch |
| `backtest.py` | Next-bar-open fills, protective stops, costs, metrics, monthly P&L vs. target |
| `montecarlo.py` | Bootstrap trade returns → drawdown distribution and P(kill switch) |
| `broker.py` | `PaperBroker` (slippage, idempotent order IDs); `LiveBroker` that fails closed |
| `journal.py` | JSONL journal of risk decisions and fills |

## Writing your own strategy

```python
from tradebot.strategy import Strategy, Signal

class MyStrategy(Strategy):
    name = "my-strategy"
    def signal(self, history):          # history[-1] is the latest CLOSED bar
        ...
        return Signal(target=1, stop_distance=2.5)   # 1 = long, 0 = flat
```

## Safety design

- Every order passes `RiskManager.approve_order`. Selling to reduce risk is always allowed;
  new buys are blocked after a daily-loss halt or when the kill switch trips.
- Resetting the kill switch requires a typed human confirmation phrase.
- `LiveBroker` refuses to trade unless `TRADEBOT_LIVE=1` is set **and** a per-order approval
  callback returns True. You implement `_send` with your broker's official API and load keys
  from environment variables only (never commit them).
- Deployment ladder: backtest → paper (≥4 weeks, ≥30 trades) → live-small with human
  approval of each order → live-scaled.
