# Business Plan: Brightside Local (working name)

An AI-run reputation service for local businesses. AI agents do the research, drafting, building,
and bookkeeping. The founder does the human-only steps, mostly sending messages and posting.

## 1. The problem

Many local service businesses, such as plumbers, auto shops, salons, cleaners, and restaurants,
have dozens of Google reviews with no owner reply. Customers read both the reviews and the replies.
Owners know replies matter but do not have time to write them.

## 2. The offer

| Offer | Price | What the client gets | Our delivery cost |
|---|---|---|---|
| **Reputation Autopilot** (core, recurring) | $149/month | A reply to every Google review within 24h, negative replies approved by the owner first, 4 Google profile posts a month, a review-request QR card and templates, and a monthly report | Agent drafting plus about 10 to 15 founder-minutes per client per week to post |
| **Website Sprint** (upsell, one-time) | $497 | A one-page mobile site in 3 business days: tap-to-call, map, services, real reviews, and a contact form | Agent build from the template plus about 30 founder-minutes to deploy |

Why these prices are starting points: they sit well below all-in-one reputation platforms aimed at
larger businesses, and above freelancer gigs that offer no ongoing service. `company-market-researcher`
checks real competitor prices in week 1 and recommends a change if the evidence supports one.

**Guarantee:** the first month is refundable for 30 days. Cancel anytime.

## 3. Ideal customer

- Local service business with a single location and an owner-operator
- 30 to 500 Google reviews, and 3 or more of the latest 10 have no owner reply
- Average job value of $150 or more, so one extra customer a month pays for the service
- **Not at first:** healthcare, dental, legal, or financial practices (privacy rules for replies)

## 4. Revenue math to $2,000 a month in pocket

| | Per client | Clients needed |
|---|---|---|
| Autopilot at $149 | $144.38 after card fees (2.9% + $0.30) | **14** for $2,021/month net |
| With $50/month in tools | | 15 |

Website Sprints add one-time cash: 2 a month adds about $965 net that month.

**Example path** (a target, not a forecast):

| Month | New Autopilot | Churn | Active | Sprints | Net in pocket (approx.) |
|---|---|---|---|---|---|
| 1 | 4 | 0 | 4 | 1 | $1,060 |
| 2 | 6 | 1 | 9 | 1 | $1,780 |
| 3 | 6 | 1 | 14 | 1 | **$2,500** |

Run `node scripts/company.js plan` for the live version from real data.

## 5. How customers are found (funnel)

Default assumptions until real data exists: 5% of contacts reply, 50% of replies take a call, and
30% of calls buy. That is 0.75%, or about 1,870 contacts for 14 clients. That number is too high,
so the plan relies on the levers that raise it:

1. **Value-first messages.** Every first touch includes 2 or 3 ready-to-post replies to the
   prospect's real unanswered reviews. Specific, free value gets far more replies than a pitch.
2. **Walk-ins and calls.** Local owners respond to people more than to email. 10 walk-ins a week
   with a printed one-page review audit.
3. **Referrals.** Ask every happy client for an introduction after their first report.
4. **Niche focus.** One niche per city at a time, so case studies match the next prospect.

The real rates replace the assumptions after 50 contacts. The CEO re-plans every Monday.

## 6. Operations (who does what)

| Work | Agent | Founder time |
|---|---|---|
| Niche validation, competitor prices, prospect lists | company-market-researcher | 0 |
| Site, offer, templates | company-offer-builder | Stripe Payment Links (about 20 min, once) |
| Outreach drafts, follow-ups, call scripts | company-sales | Send or deliver: about 45 to 60 min a day |
| Reply drafts, posts, reports, websites | company-delivery | Post: about 10 to 15 min per client per week |
| Content and referrals | company-marketer | Post: about 15 min a week |
| Books and goal tracking | company-finance | Confirm payments: about 5 min a week |
| Legal and policy review | company-compliance | Read flagged items |

At 14 clients the founder spends about 3 to 4 hours a week on delivery, plus sales time until the
goal is reached.

## 7. Costs

| Item | Cost | When |
|---|---|---|
| Stripe | 2.9% + $0.30 per card payment (check Stripe's current pricing) | Per payment |
| Domain | about $12/year | Week 1 |
| Hosting | $0 (Cloudflare Pages, Netlify, or GitHub Pages free tiers) | Week 1 |
| Business email on the domain | $0 to $7/month | Week 1 |
| Scheduling and forms | $0 (free tiers of Cal.com, Tally, or Google Forms) | Week 1 |
| Virtual mailbox for the postal address (optional) | $10 to $20/month | Week 1, if needed |

Log all of them in `finance/expenses.csv`.

## 8. Risks and how we handle them

| Risk | Response |
|---|---|
| Low reply rates | Value-first audit, walk-ins, niche change at kill criteria |
| Churn after month 1 | Monthly report that shows the value, a quick-fix promise, and a referral ask only after a good report |
| Google profile access friction | A step-by-step guide with screenshots in the intake email. Until access exists, give the owner copy-paste replies |
| Bad AI reply posted | Negative reviews always need approval, the never-say list, and same-day fixes |
| Legal or compliance | `company-compliance` gate. Founder checks business registration and taxes with a professional |

## 9. Kill and pivot criteria (decided now)

- 150 personalized contacts with fewer than 3 positive replies: change niche, then channel
- 10 calls with 0 closes: change price or offer
- 2 or more of the first 5 clients cancel: fix delivery before selling more
- More than 30 founder-minutes per client per week: automate or raise price

Pivot options already scoped: Website Sprint as the lead offer; "missed-call text-back" setup;
Google profile optimization one-time packages.

## 10. Change log

| Date | Change | Reason / evidence |
|---|---|---|
| 2026-11-05 | Initial plan | Thesis to be validated in week 1 |
