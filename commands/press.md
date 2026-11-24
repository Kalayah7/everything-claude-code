# Press Command

Runs the press: a team of `press-*` agents that researches, writes and edits books to sell on
Amazon (Kindle eBook and paperback through KDP). The founder chooses, approves, uploads and owns the accounts.

## Usage

`/press [stage] [context]`

```
/press research "what cozy mystery or Christian nonfiction ideas are selling right now?"
/press research "is there room for a short book on waiting for a job after a layoff?"
/press greenlight <slug>          # turn a researched idea into a BRIEF and start the book
/press write <slug>               # outline -> editor -> manuscript -> editor, until PASS
/press fix <slug> "chapter 3 drags; the ending of chapter 7 is confusing"
/press listing <slug>             # title, description, keywords, categories, price
/press weekly                     # the managing director's PRESS PLAN
/press status
```

## The team

| Agent | Role | Gate power |
|---|---|---|
| `press-managing-director` | Owns the list, goal, schedule and keep/change/kill calls; writes the founder's list | Decides |
| `press-researcher` | Market evidence, ranked SCAN of ideas, BRIEF per book | - |
| `press-writer` | Outline, manuscript, listing copy; revisions | - |
| `press-editor` | Structure, readability, accuracy, originality, safety, Amazon rules | **Block** |

## Stages

**research**: `press-researcher` writes a SCAN to `examples/amazon-press/research/` answering the
founder's question, then `press-managing-director` recommends which idea to greenlight. Stop and
show the founder the ranked list. The founder picks.

**greenlight `<slug>`**: the managing director adds the book to `plan/book-backlog.md`,
`press-researcher` writes `books/<slug>/brief.md`.

**write `<slug>`**: `press-writer` writes `outline.md` -> `press-editor` reviews it -> the writer
drafts the manuscript one chapter at a time -> `press-editor` returns an EDIT REPORT -> the writer
revises. Repeat until PASS (stop after 3 rounds and ask the founder).

**listing `<slug>`**: `press-writer` writes `listing.md` -> `press-editor` checks it.

**weekly / status**: `press-managing-director` reads the backlog and any founder-confirmed
royalties and writes the PRESS PLAN.

## Rules

1. No book is written without a BRIEF backed by evidence, unless the founder says to write it anyway.
2. Nothing goes on the founder's list without an editor PASS.
3. Never invent sales, ranks, reviews or facts. Never imitate a specific existing book or author's series.
4. The founder answers Amazon's AI-generated content question honestly (**yes**) for every book.
5. Only the founder publishes, pays, sets prices or changes accounts.

Workspace and details: `examples/amazon-press/README.md`.
