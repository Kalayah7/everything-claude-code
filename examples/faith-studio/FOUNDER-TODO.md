# Founder's List

Only you can do these. The staff does everything else and never claims one of these happened
until you say so.

## One-time setup (about 2.5 hours, once)

- [ ] **Read product 1** (20 min). Open `products/in-the-waiting/dist/in-the-waiting-letter.pdf`.
      Change anything that does not sound like you. Tell the staff what to fix. This review is
      real: your name is on the shop, and marketplaces expect a person to stand behind each item.
- [ ] **Confirm the voice** (5 min). The journals are broadly Christian and non-denominational,
      and quote the World English Bible. Say so if you want a different tradition or translation.
- [ ] **Pick the brand name** (20 min). "Middle Seasons" is a placeholder. Search it on Etsy,
      Pinterest, Google and the USPTO trademark search. Then set `brand.name` and
      `brand.nameIsPlaceholder: false` in `studio.config.json`, and rebuild.
- [ ] **Brand email** (10 min). Create a free address for the brand. Set `brand.contactEmail`.
- [ ] **Read the rules** (20 min). Read Etsy's current Creativity Standards and AI disclosure
      rules, and Payhip's terms. The staff could not open Etsy's policy pages from here, and Etsy
      tightened its AI rules in 2026. If our disclosure wording needs to change, tell the staff.
      Then set `brand.founderReviewedPolicies: true`.
- [ ] **Open the own store** (25 min). Payhip free plan, connected to your Stripe or PayPal.
      Set `brand.storeUrl` and `channels.store.url`.
- [ ] **Open the Etsy shop** (30 min). Bank details and identity check are yours alone.
      Set `channels.etsy.url`.
- [ ] **Pinterest business account** (10 min). Create the board "Guided Prayer Journals".
      Set `pinterest.profileUrl`.
- [ ] **List product 1** (20 min). Paste from `dist/LISTING.txt`, upload the two PDFs and three
      listing images, and choose the AI disclosure option the marketplace shows you.
- [ ] **Business basics.** Ask a local professional whether you need to register the business
      and how to handle sales tax and income tax. The staff cannot advise on this.

## Every week (about 2 hours)

| Step | Minutes | What |
|---|---|---|
| 1. Review | 30 | Read the week's new journals. Approve, or tell the staff what to change |
| 2. List | 40 | Upload approved products to Etsy and the store from each `LISTING.txt` |
| 3. Pin | 15 | Upload that week's pins and schedule them across the week |
| 4. Reply | 15 | Send the customer replies the staff drafted, edited as you like |
| 5. Numbers | 10 | Add the week's payout rows to `finance/sales.csv`, or drop the Etsy and store exports in `ops/inbox/` for the staff. Mark `verified=yes` only for money you have seen |
| 6. Decide | 10 | Read the director's WEEKLY PLAN and answer its one question |

## Optional, to reach the goal faster (about 30 minutes a week)

- [ ] Send the 5 to 10 group-license emails the marketer drafted, from the brand email address.

## Only when it comes up

- Refunds and disputes: you issue them. The staff drafts the reply.
- Anything about tax, contracts or trademarks: you and a professional.
