# RevPilot: a SaaS that helps businesses bring in revenue

A multi-tenant web app for small businesses that sell services or projects. Each business signs up,
gets its own private workspace, and uses it to turn leads into paid invoices.

It has no dependencies: plain Node.js (22.5 or newer, for the built-in SQLite) and a plain-JavaScript front end.

## What a business gets

| Area | What it does for revenue |
|------|--------------------------|
| **Dashboard** | Booked revenue (deals won) and collected revenue (invoices paid) this month, open pipeline, weighted forecast, win rate, average deal size, days to close, unpaid and overdue invoices, a 6-month trend, and which lead sources actually produce customers. |
| **Do these next** | A ranked list of the actions closest to cash: chase overdue invoices, invoice won deals that were never billed, reply to new leads, re-date deals past their close date, follow up on deals with no movement for 14 days, and overdue tasks. |
| **Lead capture form** | A hosted form per workspace (`/f/<key>`) to link or embed on a website. Each submission becomes a lead plus a same-day reply task. |
| **Pipeline** | Drag-and-drop board: Lead, Qualified, Proposal, Negotiation, then Won or Lost. Winning a deal marks the contact as a customer. |
| **Follow-ups** | Tasks tied to contacts and deals, with due dates. |
| **Invoices** | Build an invoice from a won deal, share a public link (`/i/<token>`) with an optional pay button, mark it paid. |
| **Plans** | Free, Growth ($49) and Scale ($149) with contact and invoice limits, upgraded through Stripe. |

## Run it

```bash
cd examples/revenue-saas
npm run demo        # starts http://localhost:3000 with a demo workspace
                    # log in with demo@example.com / demo-password
npm start           # same, without demo data
npm test            # 35 tests
```

Data is stored in `data/revpilot.db` (git-ignored).

## Settings (environment variables)

| Variable | Purpose |
|----------|---------|
| `PORT` | Port to listen on. Default 3000. |
| `DATABASE_FILE` | SQLite file path. Default `data/revpilot.db`. |
| `COOKIE_SECURE=1` | Set this in production (HTTPS) so the session cookie is sent only over HTTPS. |
| `TRUST_PROXY=1` | Set when behind a reverse proxy, so rate limits use the visitor's real IP. |
| `STRIPE_LINK_GROWTH`, `STRIPE_LINK_SCALE` | Stripe Payment Links for the paid plans. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the Stripe webhook. |

### Charging for plans

1. In Stripe, create a subscription Payment Link for each paid plan. On each link add metadata `plan` = `growth` or `scale`.
2. Add a webhook endpoint pointing at `https://your-domain/api/billing/webhook` for the events
   `checkout.session.completed` and `customer.subscription.deleted`.
3. Set the three `STRIPE_*` variables and restart.

The Upgrade button sends the customer to the link with their workspace id attached. The signed webhook then
moves the workspace to the paid plan, and back to Free if the subscription is cancelled.

**Not yet checked against live Stripe.** The webhook handling and signature check are tested with locally signed
events only. Run one test-mode checkout before taking real money.

## Before going live

This is a working first version, not a finished product. Known gaps:

- **One user per workspace.** No team invites or roles yet.
- **No password reset and no email sending.** Invoices are shared by copying a link; nothing is emailed.
- **Invoices are marked paid by hand.** The pay button opens the business's own payment link; it does not reconcile payments.
- **No taxes on invoices**, and one currency per workspace.
- **Single server.** SQLite and in-memory rate limits suit one process. Move to Postgres and a shared limiter to run several.
- **Put it behind HTTPS** (a reverse proxy such as Caddy or nginx) and back up the database file.

## How it is built

```
examples/revenue-saas/
|-- server.js              # entry point and configuration
|-- src/
|   |-- app.js             # router, security headers, static files
|   |-- auth.js            # signup, login, sessions (scrypt hashes, hashed session tokens)
|   |-- entities.js        # workspace-scoped contacts, deals, tasks, invoices, plan limits
|   |-- insights.js        # revenue metrics and the "do these next" ranking (pure functions)
|   |-- billing.js         # plans and the Stripe webhook
|   |-- public-pages.js    # hosted lead form and public invoice page
|   |-- http.js            # validation, body limits, rate limiting, HTML escaping
|   |-- db.js              # SQLite schema
|   `-- seed.js            # demo workspace
`-- public/                # browser app (no build step)
```

Security measures in place: every query is filtered by workspace id; passwords are hashed with scrypt; session
cookies are `HttpOnly` and `SameSite=Lax`; writes must be same-origin JSON; login, signup and the lead form are
rate limited; request bodies are capped at 100 KB; a strict Content-Security-Policy is set and the front end
never uses `innerHTML`; the lead form has a honeypot field.

Tests live in `tests/revenue-saas/revenue-saas.test.js` and run as part of `node tests/run-all.js`.
