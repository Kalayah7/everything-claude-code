# Publish guide: the only steps you do by hand

The journals, the descriptions and the research are done. This is the list of things only you
can do. Work down it in order. If you get stuck, ask the `journal-marketer` agent "what do I
do next?" and it will walk you through the first box that is not ticked.

## Before you sell anything (once)

- [ ] **Read all three journals from cover to cover.** They were written with AI tools. You
      are the person who approves them. Mark anything that sounds wrong or that you would not
      say to a reader.
- [ ] **Have the mental health pages checked.** Ask a licensed counselor or school counselor
      to read *Not Just Me* (above all days 12, 17, 18, 27, 28 and 29) and week 4 of *Money on My
      Mind*. These pages are for people who may be in a bad place. This is the most important
      box on the page.
- [ ] **Have the money pages checked.** Ask someone who knows United States personal finance
      to read *Money, Step by Step*. Student loan rules changed recently and may change again.
- [ ] **Confirm the numbers.** Open the links in `research/evidence.md` and check each figure
      that is quoted in a journal or a description. They could not be opened when this was written.
- [ ] **Choose your brand name.** "Plain Page Journals" is a placeholder. Check that the name
      you want is free, then change it in `journals.config.json` and rebuild.
- [ ] **Rebuild the PDFs:** `node examples/life-journals/scripts/build.js build`

## Set up the shop (once)

- [ ] **Pick one place to start.** A marketplace such as Etsy brings its own shoppers and
      charges fees on each sale. Your own store page (Gumroad, Payhip and others) keeps more of
      each sale and brings no shoppers. One is enough to begin. Fees change, so read the
      current fee page of whichever you choose.
- [ ] **Read that shop's rules on AI-made products and on mental health claims,** and follow
      them. Each description already carries an AI disclosure.
- [ ] **Open the account** and connect how you get paid.

## List each journal (about 20 minutes each)

For each of `money-on-my-mind`, `money-step-by-step` and `not-just-me`:

- [ ] Open `marketing/<slug>.md`.
- [ ] Paste the **Title**, the **Tags**, the **Price** and the **Description**.
- [ ] Upload both PDFs from `journals/<slug>/dist/` (Letter and A4).
- [ ] Add pictures: the cover, one daily page and one worksheet. Screenshots of the PDF work.
- [ ] Preview the listing on your phone. Read it once as if you were the buyer.
- [ ] Publish.

## Each week after that (about 30 minutes)

- [ ] Post one item from "Five posts or pins" for each journal. Pinterest suits printables.
      For the teen journal, also share with parent groups and school counselors you know.
- [ ] Write down views and sales for each journal.
- [ ] After two weeks, tell `journal-marketer` the numbers. It will suggest one change.

## Never

- Never say a journal treats or cures anything, or that it is "proven" or "therapist approved".
- Never post a review you wrote, or one from a friend who did not buy it.
- Never advertise the teen journal to teenagers. Speak to parents, counselors and teachers.
- Never upload the PDFs to this repository if it is public. They are what you sell.
