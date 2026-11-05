---
name: trading-agent-development
description: Use this skill when designing, backtesting, building, deploying, or monitoring an automated trading agent/bot, or when a user sets a trading income goal (e.g. "make $X a month trading"). Enforces honest capital math, no-look-ahead backtesting, hard risk limits, paper-first deployment, and human approval for live orders.
---

# Trading Agent Development

Guardrails for building trading agents with the `/trading-team` agents. The starter
implementation is in `examples/trading-agent/`.

## When to Activate

- The user wants a bot or agent that trades stocks, ETFs, crypto, futures, or options
- The user states an income goal for trading
- Any change to strategy, sizing, order, or broker code
- Reviewing live or paper trading results

## Core Principles

### 1. Goal → capital math first
A monthly dollar target is meaningless without capital and return assumptions.
`capital_required = monthly_target / monthly_return`. Use `tradebot.goal`:

```bash
cd examples/trading-agent
python3 -m tradebot.goal --target 2000 --capital 50000
```

Sustained returns above ~2–3% per month are exceptional. If the target needs more than
that, lower the target or extend the timeline. Never raise risk to fill the gap.

### 2. No guarantees
Never promise or imply a minimum monthly income. Report losing months and failed strategies
plainly. "No edge found" is a successful research outcome because it saves real money.

### 3. Backtests are hypotheses
- Fill at next bar open. No look-ahead.
- Include commission and slippage, then test again at 2× costs.
- Hold out an out-of-sample period and touch it once. Log the number of variants tried.
- Require ≥100 trades before trusting statistics.

### 4. Risk limits are code, not intentions
Every order passes `RiskManager.approve_order`. Default limits: 1% risk per trade,
20% max position, no leverage, 2% daily loss halt, 15% drawdown kill switch.
Kill switches have unit tests.

### 5. Deployment ladder
backtest → paper (≥4 weeks, ≥30 trades) → live-small (≤10% capital, every order
human-approved) → live-scaled. Each step needs the risk manager and compliance auditor
to sign off.

### 6. Humans approve live orders
Agents may read market data, positions, and history. Agents must not place live orders
without explicit per-order human confirmation. That includes broker MCP tools
such as `place_equity_order`: use the review/preview tool first and ask the user.

### 7. Robinhood connector
When the Robinhood MCP tools are available, follow `examples/trading-agent/ROBINHOOD.md`:
trade only the agent-enabled "MCP" account, use only the cash already in it, never margin,
always `review_equity_order` first, and get explicit chat confirmation before every
`place_*_order` call (in-app approval may be off, so the order would execute immediately).

## Workflow

1. `/trading-team build "<goal>"`
2. Iterate strategies with `/trading-team iterate` until one passes out-of-sample or you stop
3. Paper trade, then `/trading-team review` before going live
4. `/trading-team monitor` weekly and at month end

## Red Flags (stop and push back)

- "Increase leverage so we hit the target this month"
- "Turn off the daily loss limit, I'm sure it'll bounce"
- Martingale / doubling down after losses
- Backtest Sharpe > 3 with few trades or many tuned parameters
- Strategies that need the user's credentials pasted into chat or committed to the repo
