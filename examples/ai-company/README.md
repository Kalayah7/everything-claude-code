# AI Company Workspace

The operating workspace for the `/company` agent team: an AI-run services business with a
goal of **$2,000/month in verified net revenue**.

- **Business:** "Reputation Autopilot" for local businesses ($149/month). We reply to every Google
  review within 24 hours, post on their Google profile, and send a monthly report. Upsell:
  "Website Sprint" ($497 one-time). See [plan/business-plan.md](plan/business-plan.md).
- **Team:** 9 agents in `agents/company-*.md`, run with `/company` (see `commands/company.md`).
- **Founder:** you do the human-only steps in [FOUNDER-TODO.md](FOUNDER-TODO.md): bank, Stripe,
  approving each day's email batch, calls, and posting.
- **Mailer:** sends approved batches from your own mailbox with hard limits, sends follow-ups,
  and reads replies. Setup: [sales/EMAIL-SETUP.md](sales/EMAIL-SETUP.md).

## Quick start

```bash
cd examples/ai-company
node scripts/company.js init      # create the private data files (git-ignored)
node scripts/company.js check     # what's still needed before launch
node scripts/company.js plan      # clients and contacts needed to hit the goal
npm install                       # once, for the mailer
node scripts/mailer.js status     # mailer limits, quota, pending batches
```

Then in Claude Code:

```
/company launch "I'm in <your city>. I can work <N> hours a week. Start the company."
```

## Layout

```
examples/ai-company/
|-- company.config.json        # name, contact, offers, prices, Payment Links, goal, funnel assumptions
|-- FOUNDER-TODO.md            # the human-only steps, in order
|-- plan/business-plan.md      # offer, revenue math, funnel, costs, risks, kill criteria
|-- site/index.html            # landing page template -> `build-site` -> site/dist/index.html
|-- sales/outreach-playbook.md # value-first emails, walk-in and phone scripts, call script, objections
|-- sales/review-audit-template.html # printable one-page audit leave-behind for prospects
|-- sales/EMAIL-SETUP.md       # mailbox, DNS (SPF/DKIM/DMARC), app password, mailer settings
|-- sales/sent-log.csv         # every email the mailer sent                 (private, git-ignored)
|-- sales/suppression.csv      # opt-outs, bounces, complaints: never emailed again (private)
|-- sales/inbox/               # replies for sales to answer             (private, git-ignored)
|-- sales/pipeline.csv         # prospects and funnel dates            (private, git-ignored)
|-- sales/outbox/              # daily drafted messages for the founder (private, git-ignored)
|-- delivery/playbook.md       # onboarding, reply rules, posts, reports, Website Sprint SOP
|-- delivery/website-template/ # client website template
|-- delivery/review-card-template.html # printable review-request QR cards for clients
|-- delivery/clients/          # one folder per client                  (private, git-ignored)
|-- marketing/launch-content.md
|-- finance/ledger.csv         # payments and refunds, verified=yes only when confirmed (private)
|-- finance/clients.csv        # active subscriptions -> committed MRR     (private)
|-- finance/expenses.csv       # every business cost                         (private)
|-- scripts/company.js         # init | status | plan | build-site | check
|-- scripts/mailer.js          # status | check | approve | followups | send [--live] | inbox | test-connection
```

## How the goal is measured

```bash
node scripts/company.js status                 # this month
node scripts/company.js status --month 2026-12
```

Net in pocket = verified payments - refunds - payment fees - expenses, in one calendar month.
The goal is met when it prints `GOAL MET THIS MONTH: YES`. Forecasts and pipeline value never count.

## Honest expectations

- 14 active Autopilot clients at $149 is about $2,020/month after card fees.
- The plan targets that in about 3 months. That is a target, not a promise. The biggest factor
  is how many personalized contacts actually go out each week.
- Your time: about 60 to 90 minutes a day while selling, and about 10 to 15 minutes per client per
  week for posting until Google profile access is automated.
- Nothing here is legal, tax, or financial advice. Check business registration and taxes with a
  professional.
