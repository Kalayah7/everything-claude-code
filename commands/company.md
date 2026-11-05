# Company Command

Runs the AI company: a team of `company-*` agents that runs a small services business toward a
monthly net revenue goal (default **$2,000/month, verified, in pocket**). The agents research,
build, sell (by drafting), deliver, and keep the books. The founder does only the human-only
steps: money accounts, sending messages, calls, and posting where the agents have no access.

## Usage

`/company [stage] [context]`

```
/company launch "I'm in Tampa, FL. Start the company."
/company daily
/company weekly
/company sell "Joe's Plumbing replied: how much is it?"
/company deliver "New client: Bright Smile Auto, paid today"
/company close "October"
/company status
```

## The team

| Agent | Role | Gate power |
|---|---|---|
| `company-ceo` | Owns the goal, weekly plan, keep/change/kill decisions | Decides |
| `company-market-researcher` | Validates niche and pricing, builds qualified prospect lists | Can fail the thesis |
| `company-offer-builder` | Offer, pricing, landing page, deliverable templates | - |
| `company-sales` | Daily value-first outreach drafts, reply drafts, call scripts, pipeline | - |
| `company-mailer` | Checks and sends founder-approved email batches, follow-ups, reads replies | Sends only approved batches; auto-pauses |
| `company-marketer` | Content, referrals, real case studies | - |
| `company-delivery` | Onboarding, review replies, profile posts, reports, websites, churn watch | Can pause selling (capacity) |
| `company-finance` | Ledger, verified net vs. goal, clients and contacts needed, tax reserve | Source of truth for numbers |
| `company-compliance` | Anti-spam, FTC review rules, Google policy, privacy | **Block** |

## Stages

### launch (once)
```
company-ceo (intake: founder's city, hours/week, name)
  -> company-market-researcher (validate thesis, rank niches, first 50 prospects)
  -> company-offer-builder (finalize offer, build site, Payment Link steps)
  -> company-compliance (review site + outreach templates)
  -> company-sales (first outreach batch)
  -> company-ceo (WEEKLY PLAN + founder's list)
```
Ends when `company.js check` shows everything the agents can do is done, and the founder's list
holds only human-only steps.

### daily
```
company-mailer (inbox: replies, opt-outs, bounces; build follow-ups)
  -> company-sales (today's email batch + answers to replies + call/walk-in list)
  -> company-mailer (check + dry run) -> FOUNDER APPROVES in chat -> company-mailer (send --live)
company-delivery (today's client work), in parallel
```
Run every weekday. Output: a mailer brief, a delivery brief, and the founder's list for the day.
If the mailer is not set up yet (see `examples/ai-company/sales/EMAIL-SETUP.md`), the founder
sends the drafts by hand instead.

### weekly (Mondays)
```
company-finance (status + plan) -> company-ceo (WEEKLY PLAN) -> company-marketer (content plan)
company-compliance (sample 5 sent messages + 5 posted replies)
```

### sell / deliver
Route a single event to `company-sales` or `company-delivery`.

### close (first business day of the month)
```
company-finance (close month, reconcile with Stripe) -> company-ceo (MONTH REVIEW)
```

### status
Run `node examples/ai-company/scripts/company.js status` and `plan`, and show the output as-is.

## Execution pattern

1. Read `skills/ai-company-operations/SKILL.md` and follow its rules.
2. The workspace is `examples/ai-company/`. Run `node examples/ai-company/scripts/company.js init`
   if `finance/ledger.csv` is missing.
3. Pass each agent the previous agent's handoff (format below).
4. **Gates:** if `company-compliance` returns BLOCKED, stop and report the fix needed.
5. Never say money arrived, a message was sent, or a reply was posted unless the founder confirmed
   it or the mailer's sent log shows it. Put those steps on the founder's list instead.
6. Never run `mailer.js approve` or `resume` without the founder's explicit go-ahead for that
   batch in this conversation.

## Handoff format

```markdown
## HANDOFF: <from-agent> -> <to-agent>
### Scoreboard (net in pocket this month / goal, committed MRR, active clients)
### Decisions made
### Artifacts (files written, commands run + results)
### Gate status: PASS / BLOCKED
### Founder's list (human-only, with minutes)
```

## Final report

```
COMPANY REPORT
==============
Stage: launch | daily | weekly | close
Net in pocket this month (verified): $____ / $____ (__%)   GOAL MET: YES/NO
Committed MRR: $____ from __ clients    Funnel (real|assumed): __ contacts -> __ clients
Done by agents today: ...
Founder's list (about __ min): ...
Next run: /company <stage> on <date>
```

## Arguments

$ARGUMENTS:
- `launch <city and context>`: one-time setup through first outreach
- `daily`: outreach batch + client work
- `weekly`: numbers, plan, content, compliance sample
- `sell <event>` / `deliver <event>`: handle one event
- `close <month>`: month-end books and review
- `status`: scoreboard only
