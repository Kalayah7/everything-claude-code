/**
 * Tests for examples/ai-company/scripts (money math, funnel, site build)
 *
 * Run with: node tests/company/company.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('../../examples/ai-company/scripts/lib');
const cli = require('../../examples/ai-company/scripts/company');

const CONFIG = Object.freeze({
  company: { name: 'TestCo', tagline: 'Hi', contactEmail: 'a@b.co', phone: '', postalAddress: '1 Main St',
    serviceArea: 'Town', intakeFormUrl: '', bookingUrl: '' },
  goal: { monthlyNetTarget: 2000 },
  fees: { percent: 0.029, fixed: 0.3 },
  taxReserveRate: 0.25,
  offers: [
    { id: 'autopilot', name: 'Reputation Autopilot', type: 'recurring', price: 149, paymentLink: 'https://buy.stripe.com/a' },
    { id: 'website', name: 'Website Sprint', type: 'one_time', price: 497, paymentLink: '' }
  ],
  primaryRecurringOffer: 'autopilot',
  funnelAssumptions: { replyRate: 0.05, callRate: 0.5, closeRate: 0.3, minContactsForRealRates: 4 }
});

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing ai-company scripts ===\n');
  let passed = 0;
  let failed = 0;
  const t = (name, fn) => { if (test(name, fn)) passed++; else failed++; };

  console.log('CSV parsing:');
  t('parses header, quoted commas and escaped quotes', () => {
    const rows = lib.parseCsv('a,b,c\n1,"x, y","say ""hi"""\n\n2,,3\n');
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].b, 'x, y');
    assert.strictEqual(rows[0].c, 'say "hi"');
    assert.strictEqual(rows[1].b, '');
  });
  t('header-only and empty input give no rows', () => {
    assert.deepStrictEqual(lib.parseCsv('a,b\n'), []);
    assert.deepStrictEqual(lib.parseCsv(''), []);
  });
  t('handles CRLF line endings', () => {
    const rows = lib.parseCsv('a,b\r\n1,2\r\n');
    assert.strictEqual(rows[0].b, '2');
  });

  console.log('\nMoney math:');
  t('estimates Stripe-style fees', () => {
    assert.strictEqual(lib.estimateFee(149, CONFIG.fees), 4.62);
    assert.strictEqual(lib.estimateFee(-50, CONFIG.fees), 0);
  });
  t('toNumber accepts $ and commas, rejects junk', () => {
    assert.strictEqual(lib.toNumber('$1,234.50'), 1234.5);
    assert.strictEqual(lib.toNumber(''), 0);
    assert.throws(() => lib.toNumber('abc'));
  });
  t('only verified rows count toward the goal', () => {
    const ledger = [
      { date: '2026-11-03', gross: '149', fee: '', verified: 'yes' },
      { date: '2026-11-04', gross: '497', fee: '14.71', verified: '' },
      { date: '2026-10-30', gross: '149', fee: '', verified: 'yes' }
    ];
    const s = lib.summarizeMonth(ledger, [], '2026-11', CONFIG);
    assert.strictEqual(s.gross, 149);
    assert.strictEqual(s.fees, 4.62);
    assert.strictEqual(s.net, 144.38);
    assert.strictEqual(s.unverifiedCount, 1);
    assert.strictEqual(s.unverifiedGross, 497);
    assert.strictEqual(s.goalMet, false);
  });
  t('refunds and expenses reduce net; goal met at target', () => {
    const ledger = [
      { date: '2026-11-01', gross: '2500', fee: '72.80', verified: 'yes' },
      { date: '2026-11-20', gross: '-149', fee: '', verified: 'yes' }
    ];
    const expenses = [{ date: '2026-11-02', amount: '12' }, { date: '2026-12-01', amount: '99' }];
    const s = lib.summarizeMonth(ledger, expenses, '2026-11', CONFIG);
    assert.strictEqual(s.refunds, 149);
    assert.strictEqual(s.expenses, 12);
    assert.strictEqual(s.net, 2266.2);
    assert.strictEqual(s.goalMet, true);
    assert.strictEqual(s.gap, 0);
  });
  t('MRR counts only active clients and uses offer price as default', () => {
    const clients = [
      { offer_id: 'autopilot', monthly_price: '', status: 'active' },
      { offer_id: 'autopilot', monthly_price: '99', status: 'Active' },
      { offer_id: 'autopilot', monthly_price: '149', status: 'cancelled' }
    ];
    const m = lib.computeMrr(clients, CONFIG);
    assert.strictEqual(m.activeClients, 2);
    assert.strictEqual(m.gross, 248);
  });
  t('clientsNeeded rounds up using net per client', () => {
    assert.strictEqual(lib.clientsNeeded(2000, CONFIG), 14);
    assert.strictEqual(lib.clientsNeeded(144.38, CONFIG), 1);
    assert.strictEqual(lib.clientsNeeded(0, CONFIG), 0);
  });

  console.log('\nFunnel:');
  t('falls back to assumptions with too few contacts', () => {
    const r = lib.funnelRates([{ contacted_on: '2026-11-01' }], CONFIG);
    assert.strictEqual(r.source, 'assumptions');
    assert.ok(Math.abs(r.contactToClient - 0.0075) < 1e-9);
  });
  t('uses real pipeline rates once enough contacts exist', () => {
    const rows = [
      { contacted_on: 'd', replied_on: 'd', call_on: 'd', won_on: 'd' },
      { contacted_on: 'd', replied_on: 'd', call_on: '', won_on: '' },
      { contacted_on: 'd' },
      { contacted_on: 'd' },
      { business: 'not contacted yet' }
    ];
    const r = lib.funnelRates(rows, CONFIG);
    assert.strictEqual(r.source, 'pipeline');
    assert.strictEqual(r.counts.contacted, 4);
    assert.strictEqual(r.replyRate, 0.5);
    assert.strictEqual(r.callRate, 0.5);
    assert.strictEqual(r.closeRate, 1);
  });
  t('outreachNeeded handles zero conversion', () => {
    assert.strictEqual(lib.outreachNeeded(3, { contactToClient: 0 }), Infinity);
    assert.strictEqual(lib.outreachNeeded(14, { contactToClient: 0.0075 }), 1867);
  });

  console.log('\nLanding page build:');
  t('fills placeholders, escapes HTML, reports missing ones', () => {
    const html = '<h1>{{COMPANY_NAME}}</h1><a href="{{AUTOPILOT_LINK}}">${{AUTOPILOT_PRICE}}</a><a href="{{WEBSITE_LINK}}"></a>{{UNKNOWN}}';
    const cfg = { ...CONFIG, company: { ...CONFIG.company, name: 'A & B <Co>' } };
    const r = lib.renderSite(html, cfg);
    assert.ok(r.html.includes('<h1>A &amp; B &lt;Co&gt;</h1>'));
    assert.ok(r.html.includes('https://buy.stripe.com/a'));
    assert.ok(r.html.includes('$149'));
    assert.deepStrictEqual(r.missing, ['UNKNOWN', 'WEBSITE_LINK']);
  });
  t('real site template only uses known placeholders', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../examples/ai-company/site/index.html'), 'utf8');
    const r = lib.renderSite(html, CONFIG);
    const unknown = r.missing.filter(k => !['WEBSITE_LINK', 'PHONE', 'INTAKE_FORM_URL', 'BOOKING_URL'].includes(k));
    assert.deepStrictEqual(unknown, []);
  });

  console.log('\nCLI:');
  t('status and plan run against a temp workspace', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aico-'));
    fs.mkdirSync(path.join(dir, 'finance'));
    fs.mkdirSync(path.join(dir, 'sales'));
    fs.writeFileSync(path.join(dir, 'company.config.json'), JSON.stringify(CONFIG));
    fs.writeFileSync(path.join(dir, 'finance', 'ledger.csv'),
      'date,client,offer_id,description,gross,fee,verified\n2026-11-02,Joe Plumbing,autopilot,Month 1,149,,yes\n');
    fs.writeFileSync(path.join(dir, 'finance', 'clients.csv'),
      'client,offer_id,monthly_price,start_date,status,cancel_date,notes\nJoe Plumbing,autopilot,,2026-11-02,active,,\n');
    const ws = cli.loadWorkspace(dir);
    const status = cli.statusReport(ws, '2026-11');
    assert.ok(status.includes('NET IN POCKET      $144.38'));
    assert.ok(status.includes('GOAL MET THIS MONTH: NO'));
    const plan = cli.planReport(ws);
    assert.ok(plan.includes('13 more Reputation Autopilot'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  t('init creates private data files once and never overwrites them', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aico-init-'));
    const first = cli.initWorkspace(dir);
    assert.ok(first.startsWith('Created:'));
    for (const [rel, header] of Object.entries(cli.DATA_FILES)) {
      assert.strictEqual(fs.readFileSync(path.join(dir, rel), 'utf8'), header + '\n');
    }
    fs.appendFileSync(path.join(dir, 'finance', 'ledger.csv'), '2026-11-02,A,autopilot,x,149,,yes\n');
    assert.strictEqual(cli.initWorkspace(dir), 'Workspace already initialized.');
    assert.ok(fs.readFileSync(path.join(dir, 'finance', 'ledger.csv'), 'utf8').includes('149'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  t('private data paths are git-ignored', () => {
    const ignore = fs.readFileSync(path.join(__dirname, '../../.gitignore'), 'utf8');
    for (const p of ['finance/*.csv', 'sales/pipeline.csv', 'delivery/clients/', 'site/dist/']) {
      assert.ok(ignore.includes(`examples/ai-company/${p}`), `missing ignore rule for ${p}`);
    }
  });
  t('parseArgs reads flags and positionals', () => {
    const a = cli.parseArgs(['status', '--month', '2026-11', '--verbose']);
    assert.deepStrictEqual(a._, ['status']);
    assert.strictEqual(a.month, '2026-11');
    assert.strictEqual(a.verbose, true);
  });

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
