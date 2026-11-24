# Amazon Press Workspace

The workspace for the `/press` team: researching, writing and editing books to sell on Amazon
as Kindle eBooks and paperbacks through Kindle Direct Publishing (KDP).

| Agent | Job |
|---|---|
| `press-managing-director` | Picks what we publish and when, runs the pipeline, reports verified numbers, writes the founder's list |
| `press-researcher` | Finds what readers are buying and where current books fall short |
| `press-writer` | Outline, manuscript, listing copy |
| `press-editor` | Quality gate: PASS or BLOCKED |

## How a book gets made

```
research   -> research/scan-YYYY-MM-DD.md   (ranked ideas with evidence; founder picks)
greenlight -> books/<slug>/brief.md         (reader, promise, competitors, keywords, length)
write      -> books/<slug>/outline.md       -> editor
           -> books/<slug>/manuscript/*.md  -> editor (repeat until PASS)
listing    -> books/<slug>/listing.md       -> editor
founder    -> uploads to KDP (see FOUNDER-TODO.md)
```

Start in Claude Code with:

```
/press research "what should our first books be?"
```

## Layout

```
examples/amazon-press/
|-- press.config.json        # goal, founder hours, kill threshold, AI notice, imprint name
|-- FOUNDER-TODO.md          # one-time KDP setup and the per-book upload steps
|-- plan/book-backlog.md     # every book and its stage
|-- research/                # SCAN reports from press-researcher
|-- books/<slug>/
|   |-- brief.md             # from the researcher
|   |-- outline.md           # from the writer, reviewed by the editor
|   |-- notes.md             # names, facts and continuity
|   |-- manuscript/          # 00-front-matter.md, 01-...md, 99-back-matter.md
|   |-- edit-report.md       # latest editor report
|   `-- listing.md           # title, description, keywords, categories, price
```

## Ground rules

1. Evidence before effort: no book without a brief, unless the founder says otherwise.
2. The editor can block. Nothing goes to the founder without PASS.
3. Original work only. No copying or imitating a specific book, series, author or trademark.
4. Honest about AI: the books carry an AI notice, and the founder answers Amazon's AI-content question **yes**.
5. Verified money only: royalties count when the founder confirms them in the KDP reports.

Amazon's rules change. The founder should read the current KDP Content Guidelines and help pages
before each upload; nothing here is legal, tax or financial advice.
