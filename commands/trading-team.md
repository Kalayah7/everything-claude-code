# Trading Team Command

Runs the trading-agent build team, a gated pipeline of specialist agents that takes an
income goal and produces a tested trading agent. Each agent can stop the pipeline.

## Usage

`/trading-team [stage] [goal or task]`

Examples:

```
/trading-team build "Help me make $2,000/month trading US ETFs with $60k"
/trading-team review "Audit my bot before I go live"
/trading-team monitor "October results"
```

## The team

| Agent | Role | Can stop the pipeline? |
|---|---|---|
| `trading-strategist` | Goal → capital math → strategy spec + pre-registered acceptance criteria | Yes (if the goal is unrealistic, it proposes an interim goal) |
| `trading-quant-researcher` | Implements and backtests the strategy, out-of-sample, with costs | Yes (FAIL → back to strategist) |
| `trading-risk-manager` | Sizing, loss limits, kill switches, Monte Carlo risk of ruin | **Veto** |
| `trading-execution-engineer` | Paper → live-small → live-scaled order loop, broker adapter | Yes |
| `trading-compliance-auditor` | Secrets, order-path safety, PDT/wash-sale/ToS checks | **Block** |
| `trading-performance-monitor` | Live vs. backtest, progress to target, continue/reduce/halt | Recommends halt |

## Stages

### build (default)
```
trading-strategist -> trading-quant-researcher -> trading-risk-manager
  -> trading-execution-engineer (paper) -> trading-compliance-auditor
```
Ends with a bot running in **paper mode**. Going live is a separate, explicit user decision.

### iterate
```
trading-quant-researcher -> trading-risk-manager
```
Use after changing a strategy. Re-test out-of-sample and re-approve risk.

### review
```
trading-risk-manager + trading-compliance-auditor (parallel) -> trading-execution-engineer
```
Use before promoting to the next deployment stage.

### monitor
```
trading-performance-monitor
```
Run weekly and at each month end.

## Execution pattern

1. Read `skills/trading-agent-development/SKILL.md` and follow its rules.
2. Starter code is in `examples/trading-agent/`. Copy it into the user's project if they don't
   have one yet.
3. Invoke each agent with the previous agent's handoff (format below).
4. **Gates:** if an agent returns FAIL / VETOED / BLOCKED, stop. Report why and what would
   unblock it. Do not continue to the next agent.
5. Never place a live order during this command. Live trading is started by the user.

## Handoff format

```markdown
## HANDOFF: <from-agent> -> <to-agent>
### Goal & capital math
### Decisions made
### Artifacts (files, reports, test commands + results)
### Gate status: PASS / FAIL / VETO / BLOCKED
### Open questions for the user
```

## Final report

```
TRADING TEAM REPORT
===================
Goal: $____/month   Capital: $____   Implied return: __%/mo (<plausible|aggressive|unrealistic>)
Stage reached: spec | backtested | risk-approved | paper | audited
Strategy: ...
Out-of-sample: Sharpe __, MaxDD __%, months ≥ target __%
Risk limits: ...
Blockers: ...
Next step for the user: ...
Reminder: past/backtested performance does not guarantee future results; no minimum
monthly income can be guaranteed.
```

## Arguments

$ARGUMENTS:
- `build <goal>` – full pipeline to paper trading
- `iterate <change>` – re-test and re-approve a changed strategy
- `review <context>` – pre-promotion risk + compliance review
- `monitor <period>` – performance review
