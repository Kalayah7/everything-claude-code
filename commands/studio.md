# Studio Command

Runs the faith studio: a team of `studio-*` agents that makes and sells guided prayer journals
as digital downloads, toward a monthly net revenue goal (default **$5,000/month, verified**).
The agents research, write, edit, lay out, prepare listings and pins, draft replies and keep the
books. The founder gives about 2 hours a week: approving products, uploading, sending, and
confirming money.

## Usage

`/studio [stage] [context]`

```
/studio weekly
/studio produce be-still
/studio fix in-the-waiting "Day 12: the second question is confusing"
/studio care "A customer wrote: I can't find my download"
/studio close "November"
/studio status
```

## The team

| Agent | Role | Gate power |
|---|---|---|
| `studio-director` | Owns the goal, weekly plan, keep/change/kill decisions | Decides |
| `studio-researcher` | Demand evidence, backlog ranking, product briefs | - |
| `studio-writer` | Writes each journal as `product.json` | - |
| `studio-editor` | Scripture context, care, honesty, policy | **Block** |
| `studio-merchandiser` | `listing.json`, build, images, pins | - |
| `studio-marketer` | Pin schedule, emails, group-license drafts | - |
| `studio-customer-care` | Reply drafts, refund recommendations, fixes | - |
| `studio-finance` | Ledger, verified net vs. goal, orders needed | Source of truth for numbers |

## Stages

### weekly (the main run, once a week)
```
studio-finance (status + plan)
  -> studio-researcher (re-rank backlog, 2 briefs)
  -> for each brief: studio-writer -> studio-editor -> studio-merchandiser -> studio-editor
  -> studio-marketer (pin schedule; optional outreach drafts)
  -> studio-customer-care (anything in ops/inbox/)
  -> studio-director (WEEKLY PLAN + founder's list of 120 minutes or less)
```

### produce `<slug>`
One product from the backlog: researcher brief -> writer -> editor -> merchandiser -> editor.
Ends when `studio.js build <slug>` succeeds and the editor returns PASS.

### fix `<slug>` `<what>`
Writer or merchandiser makes the change, the editor re-checks it, and the product is rebuilt.

### care `<message>`
Route one customer message to `studio-customer-care`.

### close `<month>`
`studio-finance` closes the month, then `studio-director` writes the MONTH REVIEW.

### status
Run `node examples/faith-studio/scripts/studio.js status`, `plan` and `check`, and show the
output as-is.

## Execution pattern

1. Read `skills/faith-studio-operations/SKILL.md` and follow its rules.
2. The workspace is `examples/faith-studio/`. Run `node examples/faith-studio/scripts/studio.js init`
   if `finance/sales.csv` is missing.
3. Pass each agent the previous agent's handoff (format below).
4. **Gate:** if `studio-editor` returns BLOCKED, the writer or merchandiser fixes it and the
   editor reviews again. A product that is still blocked after two rounds is left off the
   founder's list and reported.
5. Commit product sources (`product.json`, `listing.json`), plans and docs. Never commit `dist/`,
   `finance/*.csv`, `data/` or `ops/inbox/`.
6. Never say a product was listed, a pin was posted, an email was sent or money arrived unless
   the founder confirmed it. Put those steps on the founder's list.

## Handoff format

```markdown
## HANDOFF: <from-agent> -> <to-agent>
### Product: <slug>
### Decisions made
### Files written, commands run and their results
### Gate status: PASS / BLOCKED (with fixes)
### For the founder (with minutes)
```

## Final report

```
STUDIO REPORT
=============
Stage: weekly | produce | fix | care | close
Net in pocket this month (verified): $____ / $____ (__%)   GOAL MET: YES/NO
Orders: __   Products written: __   Listings the founder has confirmed live: __
Shipped by the staff this run: ...
Founder's list (about __ min): ...
Next run: /studio weekly on <date>
```

## Arguments

$ARGUMENTS:
- `weekly`: numbers, 2 new products, pins, replies, plan
- `produce <slug>`: make one product from the backlog
- `fix <slug> <what>`: change a product and rebuild it
- `care <message>`: draft a reply to one customer message
- `close <month>`: month-end books and review
- `status`: scoreboard only
