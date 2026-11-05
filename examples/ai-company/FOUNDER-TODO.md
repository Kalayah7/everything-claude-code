# Founder's List: the Human-Only Steps

The agents do everything else. These steps need a person, a legal identity, or your own accounts.
Do them in order. Times are estimates.

## Week 1: set up (about 3 hours total, once)

- [ ] **1. Pick the company name (10 min).** Replace `Brightside Local` in
      `company.config.json` and set `"nameIsPlaceholder": false`. Before you commit to a name,
      search it on Google, your state's business registry, and USPTO trademark search
      (tmsearch.uspto.gov), and check that the `.com` is available.
- [ ] **2. Decide the business form (15 min to read; check with an accountant).** In the US you can
      start as a sole proprietor under your own name, or register a "DBA" for the brand name. An
      LLC is optional and costs a state fee. A free EIN from IRS.gov keeps your SSN off forms.
      This is not legal or tax advice.
- [ ] **3. Bank account (you said you'll do this).** A separate account just for the business.
- [ ] **4. Stripe account (you said you'll do this).** Use the business name and the website URL.
- [ ] **5. Domain plus business email (30 min).** Buy the `.com` (about $12/year). Set up an
      email like `hello@yourdomain.com`. Put it in `company.contactEmail`.
- [ ] **6. Postal address (10 min).** Every cold email must include one by law (CAN-SPAM). Use a
      P.O. box or virtual mailbox if you don't want to use your home address. Put it in
      `company.postalAddress`. Log the cost in `finance/expenses.csv`.
- [ ] **7. Service area and phone (2 min).** Your city or metro in `company.serviceArea`.
      Optionally add a separate business phone number in `company.phone`.
- [ ] **8. Stripe Payment Links (20 min).** In Stripe Dashboard, open **Payment Links > New**:
      - "Reputation Autopilot": $149, **recurring monthly**.
      - "Website Sprint": $497, one-time.
      - For both, set **After payment > Don't show confirmation page > redirect** to your intake
        form URL (step 9).
      - Paste each link into `offers[].paymentLink` in `company.config.json`.
- [ ] **9. Intake form and booking link (20 min).** Create a free form (Tally or Google Forms)
      with the 8 intake questions in `delivery/playbook.md`. Create a free 15-minute booking page
      (Cal.com or Google Calendar appointment schedule). Put both URLs in config.
- [ ] **10. Build and publish the site (20 min).**
      ```bash
      cd examples/ai-company
      node scripts/company.js build-site   # must say "All placeholders filled"
      ```
      Upload `site/dist/index.html` to Cloudflare Pages or Netlify (both free, drag and drop),
      and connect your domain.
- [ ] **11. Your own Google Business Profile (15 min, optional but good).** List the company as
      a service-area business without showing your home address.
- [ ] **12. Check (1 min):** `node scripts/company.js check` should show every item done.

## Every weekday (about 60 to 90 minutes)

- [ ] Run `/company daily` in Claude Code.
- [ ] Send the messages in `sales/outbox/<today>.md` from your business email. Make the calls and
      walk-ins it lists. Tell Claude what happened (who replied, who booked).
- [ ] Post the replies marked READY TO POST for each client (about 5 minutes per client). Tell
      Claude which ones you posted.
- [ ] Take any sales calls on your calendar (scripts in `sales/outreach-playbook.md`).

## Every Monday (about 15 minutes)

- [ ] Run `/company weekly`.
- [ ] Open Stripe, find payments since last week, and tell Claude the amounts and fees. Claude adds
      them to the ledger. Then **you** confirm each row so it is marked `verified=yes`.
- [ ] Move the tax reserve shown in the report to a separate savings account.

## Month end (about 20 minutes)

- [ ] Run `/company close <month>`. Read Stripe's payout total for the month to Claude to reconcile.
- [ ] The goal is met when `node scripts/company.js status --month YYYY-MM` prints
      `GOAL MET THIS MONTH: YES`.
