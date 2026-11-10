/**
 * Tests for examples/revenue-saas (revenue math, auth, tenant isolation, lead capture, invoices, billing)
 *
 * Run with: node tests/revenue-saas/revenue-saas.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

const root = '../../examples/revenue-saas';
const { openDb } = require(`${root}/src/db`);
const { createApp } = require(`${root}/src/app`);
const { computeMetrics, nextActions } = require(`${root}/src/insights`);
const { verifyStripeSignature } = require(`${root}/src/billing`);
const { hashPassword, verifyPassword } = require(`${root}/src/auth`);
const { seedDemo } = require(`${root}/src/seed`);

const WEBHOOK_SECRET = 'whsec_test';
let passed = 0;
let failed = 0;

async function t(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  }
}

/** Minimal API client that keeps one session cookie, like a browser tab. */
function client(base) {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return {
    get: path => call('GET', path),
    post: (path, body, headers) => call('POST', path, body, headers),
    patch: (path, body) => call('PATCH', path, body),
    del: path => call('DELETE', path, {})
  };
}

const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString();

async function runTests() {
  console.log('\n=== Testing revenue-saas ===\n');
  const NOW = new Date(Date.UTC(2026, 10, 15));

  console.log('Revenue math:');
  const data = {
    contacts: [
      { id: 'c1', name: 'Ann', source: 'referral', status: 'customer', created_at: iso(2026, 9, 1), last_contacted_at: iso(2026, 9, 2) },
      { id: 'c2', name: 'Bo', source: 'web-form', status: 'new', created_at: iso(2026, 11, 12), last_contacted_at: null }
    ],
    deals: [
      { id: 'd1', contact_id: 'c1', title: 'Won now', value_cents: 500000, stage: 'won', created_at: iso(2026, 10, 22), closed_at: iso(2026, 11, 1), stage_changed_at: iso(2026, 11, 1) },
      { id: 'd2', contact_id: 'c1', title: 'Won before', value_cents: 200000, stage: 'won', created_at: iso(2026, 10, 1), closed_at: iso(2026, 10, 21), stage_changed_at: iso(2026, 10, 21) },
      { id: 'd3', contact_id: 'c2', title: 'Lost', value_cents: 900000, stage: 'lost', created_at: iso(2026, 10, 1), closed_at: iso(2026, 10, 5), stage_changed_at: iso(2026, 10, 5) },
      { id: 'd4', contact_id: 'c2', title: 'Proposal', value_cents: 400000, stage: 'proposal', created_at: iso(2026, 10, 1), stage_changed_at: iso(2026, 10, 10), expected_close: null },
      { id: 'd5', contact_id: 'c2', title: 'Late', value_cents: 100000, stage: 'negotiation', created_at: iso(2026, 11, 1), stage_changed_at: iso(2026, 11, 10), expected_close: '2026-11-10' }
    ],
    tasks: [{ id: 't1', title: 'Old task', due_date: '2026-11-01', done_at: null }],
    invoices: [
      { id: 'i1', number: 'INV-0001', contact_id: 'c1', deal_id: 'd2', total_cents: 200000, status: 'paid', paid_at: iso(2026, 11, 3), due_date: '2026-11-05' },
      { id: 'i2', number: 'INV-0002', contact_id: 'c1', deal_id: null, total_cents: 30000, status: 'sent', paid_at: null, due_date: '2026-11-10' }
    ]
  };
  const m = computeMetrics(data, NOW);
  await t('booked revenue is split by the month a deal was won', () => {
    assert.strictEqual(m.booked_this_month_cents, 500000);
    assert.strictEqual(m.booked_last_month_cents, 200000);
    assert.strictEqual(m.revenue_by_month.length, 6);
    assert.strictEqual(m.revenue_by_month[5].month, '2026-11');
    assert.strictEqual(m.revenue_by_month[4].booked_cents, 200000);
  });
  await t('collected revenue counts only paid invoices', () => {
    assert.strictEqual(m.collected_this_month_cents, 200000);
    assert.strictEqual(m.outstanding_cents, 30000);
    assert.strictEqual(m.overdue_cents, 30000);
  });
  await t('pipeline, weighted forecast, win rate and cycle time', () => {
    assert.strictEqual(m.open_pipeline_cents, 500000);
    assert.strictEqual(m.weighted_forecast_cents, 400000 * 0.5 + 100000 * 0.75);
    assert.strictEqual(m.win_rate, 2 / 3);
    assert.strictEqual(m.avg_deal_cents, 350000);
    assert.strictEqual(m.avg_cycle_days, 15);
  });
  await t('lead sources are ranked by revenue won', () => {
    assert.deepStrictEqual(m.lead_sources[0], { source: 'referral', leads: 1, customers: 1, won_cents: 700000 });
  });
  await t('empty workspace reports "no data" as null, not zero', () => {
    const empty = computeMetrics({}, NOW);
    assert.strictEqual(empty.win_rate, null);
    assert.strictEqual(empty.avg_deal_cents, null);
    assert.strictEqual(empty.booked_this_month_cents, 0);
  });
  await t('next actions cover each rule and put overdue cash first', () => {
    const actions = nextActions(data, NOW);
    assert.deepStrictEqual(actions.map(a => a.type),
      ['overdue_invoice', 'uninvoiced_win', 'new_lead', 'past_close_date', 'stale_deal', 'overdue_task']);
    assert.deepStrictEqual(actions[1].ref, { deal_id: 'd1' });
  });
  await t('a stale deal with a follow-up task scheduled is not flagged', () => {
    const withTask = { ...data, tasks: [{ id: 't2', title: 'Call', deal_id: 'd4', done_at: null, due_date: '2026-12-01' }] };
    assert.ok(!nextActions(withTask, NOW).some(a => a.type === 'stale_deal'));
  });

  console.log('\nSecurity primitives:');
  await t('password hashes verify and reject', async () => {
    const hash = await hashPassword('correct horse');
    assert.ok(!hash.includes('correct horse'));
    assert.strictEqual(await verifyPassword('correct horse', hash), true);
    assert.strictEqual(await verifyPassword('wrong', hash), false);
  });
  await t('Stripe signature check rejects tampering and old timestamps', () => {
    const payload = Buffer.from('{"a":1}');
    const sign = ts => `t=${ts},v1=${crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${ts}.${payload}`).digest('hex')}`;
    assert.strictEqual(verifyStripeSignature(payload, sign(1000), WEBHOOK_SECRET, 1000), true);
    assert.strictEqual(verifyStripeSignature(Buffer.from('{"a":2}'), sign(1000), WEBHOOK_SECRET, 1000), false);
    assert.strictEqual(verifyStripeSignature(payload, sign(1000), WEBHOOK_SECRET, 2000), false);
    assert.strictEqual(verifyStripeSignature(payload, sign(1000), 'other', 1000), false);
    assert.strictEqual(verifyStripeSignature(payload, '', WEBHOOK_SECRET, 1000), false);
  });

  const db = openDb(':memory:');
  const config = { stripeWebhookSecret: WEBHOOK_SECRET, stripeLinkGrowth: 'https://buy.stripe.com/test_growth', logErrors: false };
  const server = http.createServer(createApp({ db, config }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const a = client(base);
  const b = client(base);
  const anon = client(base);

  console.log('\nAccounts:');
  await t('signup validates input', async () => {
    assert.strictEqual((await anon.post('/api/signup', { org_name: 'X', name: 'Y', email: 'bad', password: 'longenough' })).status, 400);
    assert.strictEqual((await anon.post('/api/signup', { org_name: 'X', name: 'Y', email: 'x@y.co', password: 'short' })).status, 400);
  });
  await t('signup creates a workspace and logs in', async () => {
    const res = await a.post('/api/signup', { org_name: 'Alpha Co', name: 'Ann', email: 'Ann@Alpha.co', password: 'alpha-password' });
    assert.strictEqual(res.status, 201);
    assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
    const me = await a.get('/api/me');
    assert.strictEqual(me.json.org.name, 'Alpha Co');
    assert.strictEqual(me.json.user.email, 'ann@alpha.co');
    assert.strictEqual(me.json.user.pass_hash, undefined);
  });
  await t('duplicate email is refused', async () => {
    assert.strictEqual((await anon.post('/api/signup', { org_name: 'Z', name: 'Z', email: 'ann@alpha.co', password: 'whatever-123' })).status, 409);
  });
  await t('API needs a session', async () => {
    assert.strictEqual((await anon.get('/api/contacts')).status, 401);
    assert.strictEqual((await anon.get('/api/dashboard')).status, 401);
  });
  await t('login rejects a wrong password, accepts the right one, logout ends the session', async () => {
    const c = client(base);
    assert.strictEqual((await c.post('/api/login', { email: 'ann@alpha.co', password: 'nope-nope' })).status, 401);
    assert.strictEqual((await c.post('/api/login', { email: 'ann@alpha.co', password: 'alpha-password' })).status, 200);
    assert.strictEqual((await c.get('/api/me')).status, 200);
    await c.post('/api/logout', {});
    assert.strictEqual((await c.get('/api/me')).status, 401);
  });
  await t('repeated bad logins are rate limited', async () => {
    const c = client(base);
    let last;
    for (let i = 0; i < 11; i++) last = await c.post('/api/login', { email: 'nobody@alpha.co', password: 'x' });
    assert.strictEqual(last.status, 429);
  });
  await t('non-JSON and cross-origin writes are blocked (CSRF)', async () => {
    assert.strictEqual((await a.post('/api/contacts', 'name=x', { 'Content-Type': 'application/x-www-form-urlencoded' })).status, 415);
    assert.strictEqual((await a.post('/api/contacts', { name: 'x' }, { Origin: 'https://evil.example' })).status, 403);
  });

  console.log('\nSelling workflow:');
  let contact, deal, invoice;
  await t('create and validate a contact', async () => {
    assert.strictEqual((await a.post('/api/contacts', { name: '' })).status, 400);
    assert.strictEqual((await a.post('/api/contacts', { name: 'P', status: 'bogus' })).status, 400);
    const res = await a.post('/api/contacts', { name: 'Pat Doe', email: 'pat@example.com', source: 'referral' });
    assert.strictEqual(res.status, 201);
    contact = res.json.item;
    assert.strictEqual(contact.status, 'new');
  });
  await t('logging a contact moves a new lead to contacted', async () => {
    const res = await a.patch(`/api/contacts/${contact.id}`, { contacted: true });
    assert.strictEqual(res.json.item.status, 'contacted');
    assert.ok(res.json.item.last_contacted_at);
  });
  await t('deal values must be whole cents and stages must be real', async () => {
    assert.strictEqual((await a.post('/api/deals', { title: 'Bad', value_cents: 10.5 })).status, 400);
    assert.strictEqual((await a.post('/api/deals', { title: 'Bad', value_cents: -1 })).status, 400);
    assert.strictEqual((await a.post('/api/deals', { title: 'Bad', stage: 'maybe' })).status, 400);
  });
  await t('winning a deal books revenue and turns the contact into a customer', async () => {
    deal = (await a.post('/api/deals', { title: 'Big job', value_cents: 250000, contact_id: contact.id })).json.item;
    assert.strictEqual(deal.stage, 'lead');
    let dash = (await a.get('/api/dashboard')).json;
    assert.strictEqual(dash.metrics.open_pipeline_cents, 250000);
    assert.strictEqual(dash.metrics.weighted_forecast_cents, 25000);
    const won = (await a.patch(`/api/deals/${deal.id}`, { stage: 'won' })).json.item;
    assert.ok(won.closed_at);
    dash = (await a.get('/api/dashboard')).json;
    assert.strictEqual(dash.metrics.booked_this_month_cents, 250000);
    assert.strictEqual(dash.metrics.win_rate, 1);
    assert.strictEqual(dash.actions[0].type, 'uninvoiced_win');
    const contacts = (await a.get('/api/contacts')).json.items;
    assert.strictEqual(contacts.find(c => c.id === contact.id).status, 'customer');
  });
  await t('invoice totals are computed on the server and numbered in order', async () => {
    assert.strictEqual((await a.post('/api/invoices', { items: [] })).status, 400);
    const res = await a.post('/api/invoices', {
      contact_id: contact.id, deal_id: deal.id, due_date: '2020-01-01', total_cents: 1,
      items: [{ description: 'Design', quantity: 2, unit_cents: 100000 }, { description: 'Hosting', quantity: 1.5, unit_cents: 3333 }]
    });
    assert.strictEqual(res.status, 201);
    invoice = res.json.item;
    assert.strictEqual(invoice.number, 'INV-0001');
    assert.strictEqual(invoice.total_cents, 205000);
    assert.strictEqual(invoice.status, 'draft');
  });
  await t('draft invoices are private; sent invoices have a public page with a pay link', async () => {
    assert.strictEqual((await anon.get(`/i/${invoice.public_token}`)).status, 404);
    await a.patch('/api/org', { payment_url: 'https://buy.stripe.com/pay_me' });
    assert.strictEqual((await a.patch('/api/org', { payment_url: 'javascript:alert(1)' })).status, 400);
    const sent = (await a.patch(`/api/invoices/${invoice.id}`, { status: 'sent' })).json.item;
    assert.ok(sent.issued_at);
    const page = await anon.get(`/i/${invoice.public_token}`);
    assert.strictEqual(page.status, 200);
    assert.ok(page.text.includes('INV-0001') && page.text.includes('$2,050.00') && page.text.includes('https://buy.stripe.com/pay_me'));
    assert.strictEqual((await a.patch(`/api/invoices/${invoice.id}`, { items: [{ description: 'x', unit_cents: 1 }] })).status, 409);
  });
  await t('overdue invoice tops the action list; paying it moves money to collected', async () => {
    let dash = (await a.get('/api/dashboard')).json;
    assert.strictEqual(dash.actions[0].type, 'overdue_invoice');
    assert.strictEqual(dash.metrics.overdue_cents, 205000);
    await a.patch(`/api/invoices/${invoice.id}`, { status: 'paid' });
    dash = (await a.get('/api/dashboard')).json;
    assert.strictEqual(dash.metrics.collected_this_month_cents, 205000);
    assert.strictEqual(dash.metrics.outstanding_cents, 0);
    assert.ok(!dash.actions.some(x => x.type === 'overdue_invoice' || x.type === 'uninvoiced_win'));
  });
  await t('tasks can be completed and deleted', async () => {
    const task = (await a.post('/api/tasks', { title: 'Call Pat', due_date: '2026-12-01', deal_id: deal.id })).json.item;
    assert.ok((await a.patch(`/api/tasks/${task.id}`, { done: true })).json.item.done_at);
    assert.strictEqual((await a.del(`/api/tasks/${task.id}`)).status, 200);
    assert.strictEqual((await a.del(`/api/tasks/${task.id}`)).status, 404);
  });

  console.log('\nTenant isolation:');
  await t('one workspace cannot read, change, delete or link another workspace\'s records', async () => {
    await b.post('/api/signup', { org_name: 'Beta Co', name: 'Bo', email: 'bo@beta.co', password: 'beta-password' });
    assert.deepStrictEqual((await b.get('/api/contacts')).json.items, []);
    assert.deepStrictEqual((await b.get('/api/invoices')).json.items, []);
    assert.strictEqual((await b.patch(`/api/contacts/${contact.id}`, { name: 'Hacked' })).status, 404);
    assert.strictEqual((await b.del(`/api/deals/${deal.id}`)).status, 404);
    assert.strictEqual((await b.post('/api/deals', { title: 'Steal', contact_id: contact.id })).status, 400);
    assert.strictEqual((await b.get('/api/dashboard')).json.metrics.booked_this_month_cents, 0);
    assert.strictEqual((await a.get('/api/contacts')).json.items.find(c => c.id === contact.id).name, 'Pat Doe');
  });

  console.log('\nLead capture form:');
  const formKey = (await b.get('/api/me')).json.org.form_key;
  const form = (path, fields) => anon.post(path, new URLSearchParams(fields).toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
  await t('hosted form renders with escaped workspace name', async () => {
    await b.patch('/api/org', { name: 'Beta <script>alert(1)</script>' });
    const page = await anon.get(`/f/${formKey}`);
    assert.strictEqual(page.status, 200);
    assert.ok(!page.text.includes('<script>alert(1)'));
    assert.ok(page.text.includes('&lt;script&gt;'));
    assert.strictEqual((await anon.get('/f/0000000000000000')).status, 404);
  });
  await t('a submission creates a lead, a reply task and a dashboard action', async () => {
    assert.strictEqual((await form(`/f/${formKey}`, { name: 'Lee', message: 'hi' })).status, 400);
    const res = await form(`/f/${formKey}`, { name: 'Lee Lead', email: 'lee@example.com', message: 'Need a quote' });
    assert.strictEqual(res.status, 201);
    const contacts = (await b.get('/api/contacts')).json.items;
    assert.strictEqual(contacts.length, 1);
    assert.strictEqual(contacts[0].source, 'web-form');
    assert.strictEqual(contacts[0].notes, 'Need a quote');
    assert.strictEqual((await b.get('/api/tasks')).json.items[0].title, 'Reply to new lead Lee Lead');
    assert.strictEqual((await b.get('/api/dashboard')).json.actions[0].type, 'new_lead');
    assert.strictEqual((await a.get('/api/contacts')).json.items.length, 1);
  });
  await t('JSON submissions work cross-site; honeypot submissions are dropped quietly', async () => {
    const res = await anon.post(`/f/${formKey}`, { name: 'Jo', phone: '555-0100' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
    assert.strictEqual((await form(`/f/${formKey}`, { name: 'Bot', email: 'bot@example.com', website: 'http://spam' })).status, 201);
    assert.strictEqual((await b.get('/api/contacts')).json.items.length, 2);
  });

  console.log('\nPlans and billing:');
  const orgB = (await b.get('/api/me')).json.org;
  await t('free plan stops at its contact limit with a clear message', async () => {
    db.prepare('UPDATE orgs SET plan = ? WHERE id = ?').run('free', orgB.id);
    const insert = db.prepare("INSERT INTO contacts (id, org_id, name, created_at) VALUES (?, ?, 'Filler', ?)");
    for (let i = 0; i < 48; i++) insert.run(crypto.randomUUID(), orgB.id, new Date().toISOString());
    const res = await b.post('/api/contacts', { name: 'One too many' });
    assert.strictEqual(res.status, 402);
    assert.match(res.json.error, /Upgrade/);
  });
  await t('billing summary shows usage and an upgrade link tagged with the workspace', async () => {
    const res = (await b.get('/api/billing')).json;
    assert.strictEqual(res.current, 'free');
    assert.strictEqual(res.usage.contacts, 50);
    const growth = res.plans.find(p => p.id === 'growth');
    assert.strictEqual(growth.upgrade_url, `https://buy.stripe.com/test_growth?client_reference_id=${orgB.id}`);
    assert.strictEqual(res.plans.find(p => p.id === 'scale').upgrade_url, null);
  });
  const webhook = (event, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
    return anon.post('/api/billing/webhook', payload, { 'Stripe-Signature': `t=${ts},v1=${sig}` });
  };
  const checkout = { type: 'checkout.session.completed', data: { object: { client_reference_id: orgB.id, customer: 'cus_1', payment_status: 'paid', metadata: { plan: 'growth' } } } };
  await t('unsigned or wrongly signed webhooks change nothing', async () => {
    assert.strictEqual((await webhook(checkout, 'wrong-secret')).status, 400);
    assert.strictEqual((await anon.post('/api/billing/webhook', checkout)).status, 400);
    assert.strictEqual((await b.get('/api/me')).json.org.plan, 'free');
  });
  await t('a signed checkout upgrades the workspace and lifts the limit; cancelling downgrades', async () => {
    assert.strictEqual((await webhook(checkout)).status, 200);
    assert.strictEqual((await b.get('/api/me')).json.org.plan, 'growth');
    assert.strictEqual((await b.post('/api/contacts', { name: 'Now allowed' })).status, 201);
    await webhook({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1' } } });
    assert.strictEqual((await b.get('/api/me')).json.org.plan, 'free');
  });

  console.log('\nServer:');
  await t('serves the app shell with security headers and no path traversal', async () => {
    const home = await anon.get('/');
    assert.strictEqual(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.strictEqual(home.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual((await anon.get('/../server.js')).status, 404);
    assert.strictEqual((await anon.get('/%2e%2e/src/db.js')).status, 404);
    assert.strictEqual((await anon.get('/healthz')).json.ok, true);
  });
  await t('oversized bodies are refused', async () => {
    const res = await a.post('/api/contacts', { name: 'x', notes: 'n'.repeat(200 * 1024) }).catch(() => ({ status: 413 }));
    assert.strictEqual(res.status, 413);
  });
  await t('demo seed builds a workspace whose dashboard has every kind of signal', async () => {
    const seeded = await seedDemo(db);
    assert.strictEqual(seeded.created, true);
    assert.strictEqual((await seedDemo(db)).created, false);
    const d = client(base);
    await d.post('/api/login', { email: seeded.email, password: seeded.password });
    const dash = (await d.get('/api/dashboard')).json;
    assert.ok(dash.metrics.booked_this_month_cents > 0 || dash.metrics.booked_last_month_cents > 0);
    assert.ok(dash.metrics.open_pipeline_cents > 0);
    const types = dash.actions.map(x => x.type);
    for (const type of ['overdue_invoice', 'uninvoiced_win', 'new_lead', 'past_close_date', 'stale_deal', 'overdue_task']) {
      assert.ok(types.includes(type), `missing ${type}`);
    }
  });

  await new Promise(resolve => server.close(resolve));
  db.close();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
