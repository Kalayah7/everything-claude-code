# Trading on Robinhood via the Robinhood MCP connector

Claude can trade through the Robinhood connector **only in the account the owner has
opened to agents** (nickname **"MCP"**, an individual limited-margin account). Every other
account is read-only to the agent. Never write account numbers into this repo; look them up
with `get_accounts` at runtime.

## Mandate (set by the account owner)

| Rule | Value |
|---|---|
| Capital the agent may use | **Only the cash already in the "MCP" account** (started at **$20**) |
| Deposits / transfers | Never. The agent does not move money in or out |
| Other accounts | Read-only. Never trade them |
| Leverage / margin / options / shorting | Not used. Cash only, even though the account allows margin |
| Per-order confirmation | **Required.** Robinhood in-app approval is currently OFF, so the order executes as soon as it is placed. The agent must show the preview and get an explicit "yes" in chat before every `place_*_order` call |
| Max per order | ≤ current buying power; default ≤ 25% of account value per position |

## Order workflow (every order)

1. `get_accounts` → use the account whose nickname is "MCP" (the only one open to agents).
2. `get_portfolio` → read `buying_power` (never exceed it; never rely on margin).
3. `get_trade_approval_setting` → if `human_must_approve_trades` is true, the order goes to
   the owner's Robinhood app for approval. If it is false, chat confirmation is the only safeguard.
4. `get_equity_tradability` → confirm the symbol is tradable and fractional-eligible.
5. `review_equity_order` → simulate. Show symbol, side, type, $ amount/qty, estimated price,
   any `order_checks` alerts verbatim, and the `market_data_disclosure` text verbatim.
6. Get an explicit "yes" from the owner for **this** order.
7. `place_equity_order` with a fresh UUID `ref_id` (re-use it only to retry a transport failure).
8. `get_equity_orders` / `get_equity_positions` → confirm the fill, then log it in the journal.

## Small-account notes ($20)

- Use **dollar-based fractional market orders during regular hours** (9:30–16:00 ET). Fractional
  and dollar orders do not place in extended or overnight sessions.
- With $20, a typical good month (+1%) is about **$0.20**. Treat this as a live test of the
  pipeline and risk controls, not income.
- **Pattern Day Trader rule:** this is a margin-type account under $25k, so stay within
  3 day trades per 5 business days. Prefer holding positions overnight or longer.
- Spreads and price moves matter more than commissions here. Avoid thinly traded tickers.

## The system: "Steady Compounder" (chosen 2026-11-05)

**Goal set by the owner:** start small, grow steadily, as passive as possible.

**Test (`python3 -m tradebot.rotation --data DIR`)** on Robinhood daily bars, 2016-01 to 2026-11,
price-only (no dividends), 5 bps slippage. Selection rule fixed in advance: best CAGR / MaxDD.

| System | CAGR | Max drawdown | Up months | 2023-now CAGR (held out) |
|---|---|---|---|---|
| **buy_hold VOO** | **13.0%** | 34.3% | 66% | **19.4%** |
| trend (VOO / SGOV, 200-day SMA) | 7.7% | 26.5% | 59% | 10.4% |
| dual_mom (VOO / QQQ / SGOV) | 10.3% | 28.6% | 57% | 13.1% |

The two timing systems lowered drawdown only modestly and gave up a lot of return, including
in the held-out period. **Selected: hold VOO, fully invested, cash only.** The timing variants
stay in the code for comparison. Do not re-tune them on the same data to make them "win".

**Monthly routine (agent):**
1. Read portfolio, positions, and buying power for the "MCP" account.
2. If idle cash ≥ $1 (dividends, any deposit the owner chooses to make), prepare a
   dollar-based market buy of VOO during regular hours.
3. Preview with `review_equity_order`; get the owner's confirmation (or in-app approval if
   it is turned on); place; verify the fill.
4. Report: account value, month change, total change since start, drawdown from peak.
5. Never sell in a panic. Selling only happens if the owner asks or changes the system.

**Expectations:** roughly 0.5–1%/month on average over long periods, with losing months about
one third of the time and drawdowns of 30%+ in bad years. On $20 that is cents per month. Growth
comes mainly from time and from deposits, not from trading skill.
