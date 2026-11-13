# Life Journals

Three printable guided journals about money and mental health, with the research behind them
and everything needed to list them for sale.

| Journal | For | Length |
|---|---|---|
| **Money on My Mind** (`money-on-my-mind`) | Adults in their twenties and thirties who feel anxious or ashamed about money and avoid looking at it. Where money and mental health meet. | 30 days, 45 pages |
| **Money, Step by Step** (`money-step-by-step`) | Financial literacy in four steps: high school, college, just graduated, in debt. Start at your step. | 28 lessons, 51 pages |
| **Not Just Me** (`not-just-me`) | High school students dealing with pressure, friends, phones, family and the future. | 30 days, 44 pages |

## Build the PDFs

```bash
cd examples/life-journals
node scripts/build.js verify      # check every journal against the rules (no browser needed)
node scripts/build.js build       # write US Letter and A4 PDFs to journals/<slug>/dist/
```

Building needs Playwright with Chromium. The PDFs are git-ignored because they are the product.

## What is here

```
examples/life-journals/
|-- journals/<slug>/journal.json   # the whole journal: readings, prompts, worksheets, help page
|-- journals.config.json           # brand name (placeholder), care note, AI disclosure
|-- research/evidence.md           # studies and dissertations, with links, and what we may claim
|-- marketing/<slug>.md            # title, tags, price and a conversational description
|-- marketing/PUBLISH-GUIDE.md     # the checklist of steps only the owner can do
|-- scripts/build.js               # list | verify | build
```

Agents: `design-researcher`, `design-writer` and `design-editor` make and review journals.
`journal-marketer` writes the listings and walks the owner through publishing.

## Rules built into the code

1. **Text must fit.** The build fails if any page overflows on US Letter or A4.
2. **Every day has the same shape:** a reading of 45 to 115 words, two prompts, one small step.
3. **Plain words.** Each journal sets a top reading grade, and the build checks it with a rough
   estimate.
4. **No promises.** "Guaranteed", "cure", advice to skip therapy or medicine, and unchecked
   facts all fail verification.
5. **Every journal gives a crisis line** and says it is not therapy or financial advice.

## Before selling

These journals were written with AI tools and have **not** been reviewed by a clinician or a
financial professional. The figures in `research/evidence.md` came from search summaries
because the source sites could not be opened. Work through `marketing/PUBLISH-GUIDE.md` first.

Nothing here is medical, legal, tax or financial advice.
