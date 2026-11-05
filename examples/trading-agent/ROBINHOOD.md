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
