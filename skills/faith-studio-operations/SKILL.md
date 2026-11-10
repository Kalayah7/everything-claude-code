---
name: faith-studio-operations
description: Use this skill when running or changing the faith studio (the studio-* agents and /studio command), when a user wants a faceless, mostly automated digital-product business in the faith and personal-growth niche, or when writing journals, listings, pins, customer replies or revenue reports for it. Enforces looked-up Scripture, pastoral care rules, honest AI disclosure, founder approval of every product, and verified-money accounting.
---

# Faith Studio Operations

The operating system for the `/studio` agents. The workspace is `examples/faith-studio/`.

## When to Activate

- Any `/studio` stage, or any `studio-*` agent
- Writing or editing a journal, listing, pin, email or customer reply for the studio
- The user asks how the business is doing, or what to make next

## Core Principles

### 1. Scripture is looked up, never typed
A product file holds references only. `studio.js build` pulls the verse text from the
public-domain World English Bible, pinned to one commit, and stops if a verse is missing.
Reflections paraphrase. Only public-domain translations are quoted unless the founder holds
written permission from the publisher.

### 2. First, do no harm
Readers are in hard seasons. Never promise outcomes, never tie results to the amount of the
reader's faith, never discourage medical care or counseling. Every journal carries the care
note. Sensitive seasons get a second editor pass. When in doubt, the editor blocks.

### 3. A person stands behind every product
The staff writes and builds. The founder reads and approves each journal before it is listed.
That is what makes the AI disclosure true, and marketplaces require real human involvement.
Never describe a product as handmade or written without AI.

### 4. Honest selling
No invented reviews, testimonials, sales counts or discounts. No review incentives. The
description must match the files. Nothing copied from another seller, book or devotional.

### 5. The founder does the founder-only steps
Accounts, identity and bank checks, approving products, uploading listings and pins, sending
any message, refunds, the brand name, accepting marketplace rules, registration and taxes.
Each goes on the founder's list with minutes, and the list must fit in 120 minutes a week.
Never claim one happened without the founder's confirmation.

### 6. Verified money only
```bash
node examples/faith-studio/scripts/studio.js status   # goal progress
node examples/faith-studio/scripts/studio.js plan     # orders and visits needed
```
The goal is met only when `status` prints `GOAL MET THIS MONTH: YES`. Views, favorites,
pending orders and forecasts are never revenue.

### 7. Keep private things private
`finance/*.csv`, `ops/inbox/`, `data/` and every `products/*/dist/` folder are git-ignored. The
built PDFs are what the shop sells, and this repo may be public. Never commit them.

### 8. Marketplace rules change
Etsy tightened its AI rules during 2026 and the staff cannot always open the policy pages.
Before the first listing, and whenever a listing is rejected, the founder reads the current
rules and the staff adjusts the disclosure and process to match. Never advise working around a
marketplace rule.

## The weekly loop

| Step | Agent | Done when |
|---|---|---|
| Numbers | studio-finance | `status` and `plan` output reported as-is |
| Pick | studio-researcher | 2 briefs with evidence |
| Write | studio-writer | `studio.js verify <slug>` has no product problems |
| Gate | studio-editor | PASS |
| Package | studio-merchandiser | `studio.js build <slug>` succeeds and images are checked |
| Promote | studio-marketer | Pin schedule for the week |
| Care | studio-customer-care | A draft for every message in `ops/inbox/` |
| Plan | studio-director | WEEKLY PLAN with a founder's list of 120 minutes or less |

## Honest expectations

$5,000 a month needs about 14 orders a day at the starting prices. From no audience on 2 hours
a week, the likely result by month 4 is a few hundred dollars a month; $5,000 is the stretch
goal. Say this plainly whenever the founder asks how it is going. The kill criteria in
`plan/business-plan.md` were decided in advance: when one trips, recommend the change.
