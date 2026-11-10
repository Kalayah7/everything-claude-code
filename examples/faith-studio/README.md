# Faith Studio Workspace

The operating workspace for the `/studio` agent team: a faceless digital-product business that
sells **guided prayer journals for hard seasons** (waiting, grief, anxiety, new beginnings).

- **Goal:** $5,000/month in verified net revenue. See the honest odds in
  [plan/business-plan.md](plan/business-plan.md).
- **Brand:** "Middle Seasons" (a placeholder until the founder checks the name).
- **Founder's time:** about 2 hours a week. See [FOUNDER-TODO.md](FOUNDER-TODO.md).
- **Staff:** 8 agents in `agents/studio-*.md`, run with `/studio` (see `commands/studio.md`).
- **First product:** `products/in-the-waiting/`, a finished 30-day journal.

## Quick start

```bash
cd examples/faith-studio
node scripts/studio.js init                    # create the private data files (git-ignored)
node scripts/studio.js build in-the-waiting    # PDFs, listing images, pins, copy sheet
node scripts/studio.js check                   # what is still open before launch
node scripts/studio.js plan                    # orders and visits needed to hit the goal
```

Then in Claude Code:

```
/studio weekly
```

## What `build` makes

Everything needed to list one product lands in `products/<slug>/dist/`:

| File | Use |
|---|---|
| `<slug>-letter.pdf`, `<slug>-a4.pdf` | The files the customer downloads |
| `listing-1-cover.png`, `listing-2-inside.png`, `listing-3-included.png` | Listing photos |
| `pin-1.png` ... | Pinterest pins (1000 x 1500) |
| `pins.csv` | Title, description, link and board for each pin |
| `LISTING.txt` | Title, 13 tags, price, description and AI disclosure to paste |

## Layout

```
examples/faith-studio/
|-- studio.config.json       # brand, goal, prices, channel fees, assumptions, disclosures
|-- FOUNDER-TODO.md          # one-time setup and the 2-hour weekly routine
|-- plan/business-plan.md    # niche, offers, revenue math, roadmap, kill criteria, risks
|-- plan/product-backlog.md  # the next products, ranked, with dates
|-- products/<slug>/product.json   # the journal: days, verse references, reflections, prompts
|-- products/<slug>/listing.json   # title, tags, description, disclosure, pins
|-- products/<slug>/dist/          # built files                         (git-ignored)
|-- marketing/                     # email welcome sequence, group-license outreach
|-- ops/                           # customer reply templates; ops/inbox/ is private
|-- finance/sales.csv              # verified sales and payouts             (private)
|-- finance/expenses.csv, traffic.csv                                       (private)
|-- data/bible/                    # public-domain Bible text, downloaded once (git-ignored)
|-- scripts/studio.js              # init | verify | build | status | plan | check
```

## Rules built into the code

1. **Scripture is never typed.** A product file holds only references such as `Psalm 46:10`.
   The verse text is looked up from the public-domain World English Bible at build time. A
   missing verse stops the build.
2. **Text must fit.** The build fails if any page overflows, on US Letter or A4.
3. **No promises.** Reflections that guarantee outcomes or replace medical care fail verification.
4. **Verified money only.** The goal is met only when `status` prints `GOAL MET THIS MONTH: YES`.
5. **Built products stay out of git.** This repo may be public, and the PDFs are what the shop sells.

Nothing here is legal, tax, or financial advice.
