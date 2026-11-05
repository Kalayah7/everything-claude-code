---
name: ai-company-operations
description: Use this skill when running or changing the AI company (the company-* agents and /company command), when a user sets a business revenue goal such as "make $2,000 a month with an AI company", or when drafting outreach, review replies, pricing, or revenue reports for it. Enforces verified-money accounting, human-only actions for money and sending, value-first compliant outreach, and honest marketing.
---

# AI Company Operations

The operating system for the `/company` agents. The workspace is `examples/ai-company/`.

## When to Activate

- The user wants an AI or agent-run business that earns a monthly income
- Any `/company` stage, or any `company-*` agent
- Drafting sales messages, review replies, website copy, or revenue reports for the company

## Core Principles

### 1. Revenue math first
`$2,000/month net` at `$149/month` per client, minus about 3% in card fees, needs **14 active
clients**. Every plan starts from:

```bash
node examples/ai-company/scripts/company.js plan
```

It shows the clients still needed and the contacts needed at the current funnel rates.
After 50 contacts it switches from assumed rates to real ones. Re-plan every Monday.

### 2. Verified money only
The goal is met only when `company.js status` prints `GOAL MET THIS MONTH: YES`. That requires
ledger rows the founder marked `verified=yes` after seeing the money. Fees, refunds, and expenses
are subtracted. Never report forecasts, pipeline value, or "they said yes" as revenue.

### 3. Humans do the human-only steps
Agents draft, research, build, analyze, and track. The founder does these:
- Open the bank and Stripe accounts, create Payment Links, issue refunds
- Approve each email batch. `company-mailer` sends only approved batches, through
  `scripts/mailer.js`, from the founder's own mailbox. No other sending path exists. The founder
  also sends DMs, makes calls and does walk-ins
- Post on clients' Google profiles until access exists; sign anything; register the business; taxes

Put each step on the founder's list with its exact steps and the minutes it should take. Never claim
one happened without the founder's confirmation.

### 4. Value-first, compliant outreach
- Every first touch includes free, ready-to-post draft replies to the prospect's real unanswered
  reviews. Personalize every message.
- Email: honest From and subject, postal address, opt-out, and no purchased or guessed addresses.
  The mailer enforces all of these. It also enforces business hours, warm-up (10, then 20, then
  30 a day), at most 40 a day, 1 to 3 minutes between emails, and an auto-pause on more than 5%
  bounces or any complaint. Agents never loosen these limits.
- Phone: manual calls only. No autodialers, prerecorded calls, or cold SMS.
- Opt-outs and do-not-call requests are permanent.

### 5. Honest marketing
- No fake, bought, or AI-generated reviews, ever, for anyone. No review gating. No incentives for reviews.
- No invented testimonials, logos, results, or guarantees of rankings.
- Disclose AI-assisted replies honestly.
- Testimonials and case studies only with written client permission.

### 6. Delivery protects revenue
Recurring revenue only grows if clients stay. Meet every SLA: reply within 24 hours, negative
reviews approved by the client first, 4 posts a month, and the report by business day 3. If delivery
cannot keep up, sales pauses.

### 7. Private data stays private
Ledgers, the client list, the pipeline, outbox drafts, mailer logs, the suppression list, and
client folders are git-ignored. Run `company.js init` to create them locally. Never commit them,
because this repo may be public. Mail credentials live only in `examples/ai-company/.env`
(git-ignored) or the environment, never in chat or in the repo.

### 8. Kill criteria are decided in advance
Change niche, offer, or channel if: 150 contacts give fewer than 3 positive replies, 10 calls give
0 closes, 2 or more of the first 5 clients cancel, or delivery takes more than 30 founder-minutes per
client per week.

## Realistic timeline

| Weeks | What should be true |
|---|---|
| 1 | Thesis validated, site live with Payment Links, 50+ qualified prospects, outreach started |
| 2-4 | First 1-3 paying clients. Delivery SOP proven. Real funnel rates measured |
| 5-8 | 6-10 clients. Referrals and case studies start. Website Sprint upsells |
| 9-12 | 14+ clients: about $2,000/month net recurring, if churn stays low |

These are targets, not guarantees. The outcome depends mostly on how many personalized contacts
the founder actually sends each week.
