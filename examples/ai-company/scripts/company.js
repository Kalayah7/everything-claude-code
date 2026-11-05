#!/usr/bin/env node
/**
 * AI company operating CLI.
 *
 * Usage (from examples/ai-company/):
 *   node scripts/company.js init                        Create the private (git-ignored) data files
 *   node scripts/company.js status [--month YYYY-MM]   Goal progress in verified dollars
 *   node scripts/company.js plan                        Clients and outreach still needed
 *   node scripts/company.js build-site                  Fill the landing page from config
 *   node scripts/company.js check                       Launch-readiness checklist
 *
 * Options:
 *   --dir <path>   Company workspace (default: the folder above this script)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

// Private data files. They are git-ignored and created locally by `init`.
const DATA_FILES = Object.freeze({
  'finance/ledger.csv': 'date,client,offer_id,description,gross,fee,verified',
  'finance/expenses.csv': 'date,vendor,description,amount',
  'finance/clients.csv': 'client,offer_id,monthly_price,start_date,status,cancel_date,notes',
  'sales/pipeline.csv': 'business,niche,city,contact_name,email,phone,website,google_rating,review_count,unanswered_reviews,source_url,contacted_on,replied_on,call_on,won_on,lost_on,unsubscribed,next_step,notes',
  'sales/sent-log.csv': 'sent_at,local_date,batch,message_id_local,message_id,kind,business,to,subject,status,error',
  'sales/suppression.csv': 'email,reason,date'
});
const DATA_DIRS = Object.freeze(['sales/outbox', 'sales/inbox', 'delivery/clients', 'delivery/permissions', 'marketing']);

function initWorkspace(dir) {
  const created = [];
  for (const d of DATA_DIRS) {
    const p = path.join(dir, d);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      created.push(`${d}/`);
    }
  }
  for (const [rel, header] of Object.entries(DATA_FILES)) {
    const p = path.join(dir, rel);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, header + '\n');
      created.push(rel);
    }
  }
  return created.length > 0
    ? `Created: ${created.join(', ')}\nThese files hold private data and are git-ignored.`
    : 'Workspace already initialized.';
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  return lib.parseCsv(fs.readFileSync(file, 'utf8'));
}

function loadWorkspace(dir) {
  const configPath = path.join(dir, 'company.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`No company.config.json in ${dir}`);
  }
  return {
    dir,
    config: JSON.parse(fs.readFileSync(configPath, 'utf8')),
    ledger: readCsv(path.join(dir, 'finance', 'ledger.csv')),
    expenses: readCsv(path.join(dir, 'finance', 'expenses.csv')),
    clients: readCsv(path.join(dir, 'finance', 'clients.csv')),
    pipeline: readCsv(path.join(dir, 'sales', 'pipeline.csv'))
  };
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function pct(x) {
  return `${(x * 100).toFixed(x > 0 && x < 0.01 ? 2 : 1)}%`;
}

function statusReport(ws, month) {
  const { config } = ws;
  const s = lib.summarizeMonth(ws.ledger, ws.expenses, month, config);
  const mrr = lib.computeMrr(ws.clients, config);
  const rates = lib.funnelRates(ws.pipeline, config);
  const need = lib.clientsNeeded(s.gap, config);
  const offer = config.offers.find(o => o.id === config.primaryRecurringOffer);
  const contacts = lib.outreachNeeded(need, rates);

  const lines = [
    `AI COMPANY STATUS - ${config.company.name} - ${month}`,
    '='.repeat(60),
    `Goal: ${lib.money(s.target)} net in one month (verified money only)`,
    '',
    'Verified this month',
    `  Gross received     ${lib.money(s.gross)}`,
    `  Refunds           -${lib.money(s.refunds)}`,
    `  Payment fees      -${lib.money(s.fees)}`,
    `  Expenses          -${lib.money(s.expenses)}`,
    `  NET IN POCKET      ${lib.money(s.net)}`,
    '',
    `Progress ${lib.progressBar(s.progress)} ${pct(Math.min(1, s.progress))}   Gap: ${lib.money(s.gap)}`,
    `Set aside for taxes (${pct(config.taxReserveRate || 0)} of net): ${lib.money(s.taxReserve)}`,
    '',
    `Committed MRR: ${lib.money(mrr.gross)} gross / ${lib.money(mrr.net)} after fees from ${mrr.activeClients} active client(s)`,
    s.unverifiedCount > 0
      ? `Not counted: ${s.unverifiedCount} unverified ledger row(s) worth ${lib.money(s.unverifiedGross)}. Confirm them in Stripe and set verified=yes.`
      : 'Unverified ledger rows: 0',
    '',
    s.goalMet
      ? 'GOAL MET THIS MONTH: YES'
      : `GOAL MET THIS MONTH: NO. Close the gap with ${need} more ${offer.name} client(s) at ${lib.money(lib.netPerSale(offer, config.fees))} net each.`,
    s.goalMet
      ? ''
      : `Outreach needed at ${rates.source} funnel (${pct(rates.replyRate)} reply x ${pct(rates.callRate)} call x ${pct(rates.closeRate)} close): ~${contacts} contacts`
  ];
  return lines.filter((l, i, arr) => !(l === '' && i === arr.length - 1)).join('\n');
}

function planReport(ws) {
  const { config } = ws;
  const mrr = lib.computeMrr(ws.clients, config);
  const gap = Math.max(0, config.goal.monthlyNetTarget - mrr.net);
  const need = lib.clientsNeeded(gap, config);
  const rates = lib.funnelRates(ws.pipeline, config);
  const contacts = lib.outreachNeeded(need, rates);
  const offer = config.offers.find(o => o.id === config.primaryRecurringOffer);
  const weeks = [4, 8, 12];

  const lines = [
    `RECURRING PLAN - ${config.company.name}`,
    '='.repeat(60),
    `Target: ${lib.money(config.goal.monthlyNetTarget)} net/month`,
    `Committed recurring after fees: ${lib.money(mrr.net)} (${mrr.activeClients} client(s))`,
    `Recurring gap: ${lib.money(gap)} -> ${need} more ${offer.name} client(s) at ${lib.money(offer.price)}/mo`,
    '',
    `Funnel (${rates.source}): ${rates.counts.contacted} contacted, ${rates.counts.replied} replied, ${rates.counts.calls} calls, ${rates.counts.won} won`,
    `  reply ${pct(rates.replyRate)}  call ${pct(rates.callRate)}  close ${pct(rates.closeRate)}  => ${pct(rates.contactToClient)} of contacts become clients`,
    `Contacts needed: ~${contacts}`,
    '',
    'Pace options:'
  ];
  for (const w of weeks) {
    const perDay = contacts === Infinity ? Infinity : Math.ceil(contacts / (w * 5));
    lines.push(`  ${w} weeks -> ~${perDay} personalized contacts per weekday`);
  }
  lines.push('', 'One-time Website Sprint sales count toward the month they are paid, but do not recur.');
  return lines.join('\n');
}

function buildSite(ws) {
  const src = path.join(ws.dir, 'site', 'index.html');
  const outDir = path.join(ws.dir, 'site', 'dist');
  const html = fs.readFileSync(src, 'utf8');
  const result = lib.renderSite(html, ws.config);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), result.html);
  const lines = [`Wrote ${path.relative(process.cwd(), path.join(outDir, 'index.html')) || 'site/dist/index.html'}`];
  if (result.missing.length > 0) {
    lines.push(`NOT READY TO PUBLISH. Fill these in company.config.json: ${result.missing.join(', ')}`);
  } else {
    lines.push('All placeholders filled. Ready to deploy.');
  }
  return { text: lines.join('\n'), ready: result.missing.length === 0 };
}

function checkReport(ws) {
  const c = ws.config;
  const items = [
    ['Company name chosen (not the placeholder)', c.company.nameIsPlaceholder !== true],
    ['Contact email set', Boolean(c.company.contactEmail)],
    ['Postal address set (required in every cold email)', Boolean(c.company.postalAddress)],
    ['Service area set', Boolean(c.company.serviceArea)],
    ['Intake form URL set', Boolean(c.company.intakeFormUrl)],
    ['Booking link set', Boolean(c.company.bookingUrl)],
    ...c.offers.map(o => [`Stripe Payment Link for ${o.name}`, Boolean(o.paymentLink)]),
    ['At least 25 prospects in sales/pipeline.csv', ws.pipeline.length >= 25]
  ];
  const done = items.filter(([, ok]) => ok).length;
  const lines = [`LAUNCH CHECK - ${done}/${items.length} ready`, '='.repeat(60)];
  for (const [label, ok] of items) lines.push(`  [${ok ? 'x' : ' '}] ${label}`);
  return { text: lines.join('\n'), ready: done === items.length };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'status';
  const dir = path.resolve(args.dir || path.join(__dirname, '..'));
  const ws = loadWorkspace(dir);

  switch (cmd) {
    case 'init':
      process.stdout.write(initWorkspace(dir) + '\n');
      break;
    case 'status':
      process.stdout.write(statusReport(ws, args.month || currentMonth()) + '\n');
      break;
    case 'plan':
      process.stdout.write(planReport(ws) + '\n');
      break;
    case 'build-site': {
      const r = buildSite(ws);
      process.stdout.write(r.text + '\n');
      if (!r.ready) process.exitCode = 2;
      break;
    }
    case 'check': {
      const r = checkReport(ws);
      process.stdout.write(r.text + '\n');
      if (!r.ready) process.exitCode = 2;
      break;
    }
    default:
      process.stderr.write(`Unknown command "${cmd}". Use init, status, plan, build-site or check.\n`);
      process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, initWorkspace, loadWorkspace, statusReport, planReport, buildSite, checkReport, DATA_FILES };
