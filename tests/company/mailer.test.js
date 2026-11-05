/**
 * Tests for the outreach mailer (examples/ai-company/scripts/mailer*.js)
 *
 * Run with: node tests/company/mailer.test.js
 * No network: sending uses a fake transport and a fake clock.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ml = require('../../examples/ai-company/scripts/mailer-lib');
const mailer = require('../../examples/ai-company/scripts/mailer');
const lib = require('../../examples/ai-company/scripts/lib');
const company = require('../../examples/ai-company/scripts/company');

const THU_10AM_ET = new Date('2026-11-05T15:00:00Z');
const FRI_10AM_ET = new Date('2026-11-06T15:00:00Z');

function baseConfig(mailerOverrides = {}) {
  return {
    company: { name: 'TestCo', ownerName: 'Sam', postalAddress: 'PO Box 1, Town, ST 00000', website: 'https://testco.example' },
    goal: { monthlyNetTarget: 2000 },
    fees: { percent: 0.029, fixed: 0.3 },
    offers: [{ id: 'autopilot', name: 'Autopilot', type: 'recurring', price: 149 }],
    primaryRecurringOffer: 'autopilot',
    funnelAssumptions: { replyRate: 0.05, callRate: 0.5, closeRate: 0.3 },
    mailer: { enabled: true, provider: 'google', fromName: 'Sam', fromEmail: 'sam@testco.example', timezone: 'America/New_York', ...mailerOverrides }
  };
}

function msg(over = {}) {
  return {
    id: 'm1', kind: 'first', business: 'Joe Plumbing', to: 'joe@joeplumbing.example',
    toSource: 'https://joeplumbing.example/contact', subject: '3 reviews for Joe Plumbing are waiting on a reply',
    body: 'Hi Joe, I wrote replies to your three newest reviews. Reply: Thanks so much, Sarah!', ...over
  };
}

function ctx(over = {}) {
  const config = over.config || baseConfig();
  return { config, settings: ml.mailerSettings(config), suppression: [], pipeline: [], sentLog: [], batchMessages: null, ...over };
}

function makeWorkspace(config = baseConfig()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aico-mail-'));
  fs.writeFileSync(path.join(dir, 'company.config.json'), JSON.stringify(config));
  company.initWorkspace(dir);
  fs.writeFileSync(path.join(dir, '.env'), 'MAILER_USER=sam@testco.example\nMAILER_PASS=dummy-app-password\n');
  return dir;
}

function writeBatch(dir, name, messages, extra = {}) {
  fs.writeFileSync(path.join(dir, 'sales/outbox', `${name}.json`), JSON.stringify({ date: name, messages, ...extra }, null, 2));
}

function addProspects(dir, rows) {
  const p = path.join(dir, 'sales/pipeline.csv');
  const text = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, lib.toCsv(lib.csvHeader(text), rows));
}

function fakeIo(dir, opts = {}) {
  const sent = [];
  let clock = opts.now || THU_10AM_ET;
  return {
    sent,
    setNow: d => { clock = d; },
    io: {
      dir,
      env: {},
      now: () => clock,
      sleep: async () => {},
      transportFactory: () => ({
        send: async mail => {
          if (opts.fail && opts.fail[mail.to]) throw opts.fail[mail.to];
          sent.push(mail);
          return { messageId: mail.messageId };
        },
        verify: async () => true,
        close: () => {}
      }),
      imapFetch: opts.imapFetch
    }
  };
}

function personalized(n) {
  return Array.from({ length: n }, (_, i) => msg({
    id: `b-${i}`, business: `Biz ${i}`, to: `owner${i}@biz${i}.example`, toSource: `https://biz${i}.example`,
    body: `Hi owner ${i}, here are replies for Biz ${i} review number ${i}.`
  }));
}

const tests = [];
const t = (name, fn) => tests.push({ name, fn });

// ---------- pure rules ----------

t('provider presets fill SMTP/IMAP, explicit values override', () => {
  const s = ml.mailerSettings(baseConfig());
  assert.strictEqual(s.smtp.host, 'smtp.gmail.com');
  assert.strictEqual(s.imap.port, 993);
  const z = ml.mailerSettings(baseConfig({ provider: 'zoho', smtp: { host: 'smtp.custom.example', port: '' } }));
  assert.strictEqual(z.smtp.host, 'smtp.custom.example');
  assert.strictEqual(z.smtp.port, 465);
});

t('delay has a 30s floor except for a local test server', () => {
  const remote = ml.mailerSettings(baseConfig({ delaySeconds: { min: 0, max: 1 } }));
  assert.deepStrictEqual(ml.effectiveDelay(remote), { min: 30, max: 30 });
  const local = ml.mailerSettings(baseConfig({ delaySeconds: { min: 0, max: 0 }, smtp: { host: '127.0.0.1', port: 2525 } }));
  assert.deepStrictEqual(ml.effectiveDelay(local), { min: 0, max: 0 });
});

t('footer with postal address and opt-out is added exactly once', () => {
  const c = baseConfig();
  const once = ml.withFooter('Hello', c);
  assert.ok(once.includes('PO Box 1, Town, ST 00000'));
  assert.ok(once.includes(ml.OPT_OUT_LINE));
  assert.strictEqual(ml.withFooter(once, c), once);
});

t('a clean personalized first email passes every check', () => {
  assert.deepStrictEqual(ml.checkMessage(msg(), ctx()), []);
});

t('checks catch the common mistakes', () => {
  const has = (m, c, text) => assert.ok(ml.checkMessage(m, c).some(p => p.includes(text)), `expected "${text}"`);
  has(msg({ to: 'not-an-email' }), ctx(), 'invalid recipient');
  has(msg({ subject: 'Re: quick question' }), ctx(), 'must not pretend');
  has(msg({ toSource: '' }), ctx(), 'toSource');
  has(msg({ body: 'Hi [Owner first name], thanks' }), ctx(), 'unfilled placeholders');
  has(msg({ body: 'Hi {{NAME}}' }), ctx(), 'unfilled placeholders');
  has(msg({ attachments: ['a.pdf'] }), ctx(), 'attachments');
  has(msg({ body: 'x'.repeat(3000) }), ctx(), 'too long');
  const noAddr = baseConfig();
  noAddr.company.postalAddress = '';
  has(msg(), ctx({ config: noAddr }), 'postal address');
});

t('suppression by email, by @domain rule, and by pipeline unsubscribed', () => {
  const has = c => assert.ok(ml.checkMessage(msg(), c).some(p => p.includes('opted out')));
  has(ctx({ suppression: [{ email: 'JOE@joeplumbing.example' }] }));
  has(ctx({ suppression: [{ email: '@joeplumbing.example' }] }));
  has(ctx({ pipeline: [{ email: 'joe@joeplumbing.example', unsubscribed: 'yes' }] }));
});

t('never emails the same address twice as a first touch; flags copy-paste batches', () => {
  const c = ctx({ sentLog: [{ to: 'joe@joeplumbing.example', status: 'sent', kind: 'first', message_id_local: 'old' }] });
  assert.ok(ml.checkMessage(msg(), c).some(p => p.includes('already contacted')));
  const a = msg({ id: 'a' });
  const b = msg({ id: 'b', to: 'x@y.example' });
  assert.ok(ml.checkMessage(a, ctx({ batchMessages: [a, b] })).some(p => p.includes('personalize')));
});

t('send window respects time zone, hours and weekdays', () => {
  const s = ml.mailerSettings(baseConfig());
  assert.strictEqual(ml.inSendWindow(new Date('2026-11-05T14:00:00Z'), s), true);  // Thu 9:00 ET
  assert.strictEqual(ml.inSendWindow(new Date('2026-11-05T13:59:00Z'), s), false); // Thu 8:59 ET
  assert.strictEqual(ml.inSendWindow(new Date('2026-11-05T21:00:00Z'), s), false); // Thu 16:00 ET
  assert.strictEqual(ml.inSendWindow(new Date('2026-11-07T15:00:00Z'), s), false); // Saturday
});

t('warm-up raises the daily cap weekly and never exceeds maxPerDay', () => {
  const s = ml.mailerSettings(baseConfig());
  assert.strictEqual(ml.dailyQuota([], '2026-11-05', s).cap, 10);
  const log = [{ status: 'sent', local_date: '2026-11-02' }, { status: 'sent', local_date: '2026-11-10' }];
  const q = ml.dailyQuota(log, '2026-11-10', s);
  assert.strictEqual(q.cap, 20);
  assert.strictEqual(q.remaining, 19);
  assert.strictEqual(ml.dailyQuota(log, '2026-12-30', s).cap, 40);
  const tight = ml.mailerSettings(baseConfig({ maxPerDay: 15 }));
  assert.strictEqual(ml.dailyQuota(log, '2026-11-23', tight).cap, 15);
});

t('auto-pause on complaints or bounce rate above 5% (after 20 sends)', () => {
  const s = ml.mailerSettings(baseConfig());
  const rows = (n, b) => Array.from({ length: n }, (_, i) => ({ status: i < b ? 'bounced' : 'sent' }));
  assert.strictEqual(ml.breakerStatus(rows(20, 2), {}, s).paused, true);
  assert.strictEqual(ml.breakerStatus(rows(20, 1), {}, s).paused, false);
  assert.strictEqual(ml.breakerStatus(rows(10, 5), {}, s).paused, false);
  assert.strictEqual(ml.breakerStatus([], { complaints: [{ email: 'a@b.c' }] }, s).paused, true);
});

t('follow-ups: day 3 and day 7, only without reply/opt-out/bounce, threaded', () => {
  const s = ml.mailerSettings(baseConfig());
  const c = baseConfig();
  const first = { kind: 'first', status: 'sent', to: 'joe@joeplumbing.example', business: 'Joe Plumbing', local_date: '2026-11-02', subject: 'Hello Joe', message_id: '<m1@testco.example>' };
  const pipe = [{ business: 'Joe Plumbing', email: 'joe@joeplumbing.example', contact_name: 'Joe Smith' }];
  const d3 = ml.dueFollowUps([first], pipe, [], '2026-11-05', s, c);
  assert.strictEqual(d3.length, 1);
  assert.strictEqual(d3[0].kind, 'followup1');
  assert.strictEqual(d3[0].subject, 'Re: Hello Joe');
  assert.strictEqual(d3[0].inReplyTo, '<m1@testco.example>');
  assert.ok(d3[0].body.startsWith('Hi Joe,'));
  assert.strictEqual(ml.dueFollowUps([first], pipe, [], '2026-11-04', s, c).length, 0);
  assert.strictEqual(ml.dueFollowUps([first], [{ ...pipe[0], replied_on: '2026-11-03' }], [], '2026-11-05', s, c).length, 0);
  assert.strictEqual(ml.dueFollowUps([first], pipe, [{ email: 'joe@joeplumbing.example' }], '2026-11-05', s, c).length, 0);
  assert.strictEqual(ml.dueFollowUps([first], pipe, [], '2026-11-09', s, c).length, 0, 'followup2 needs followup1 first');
  const f1 = { kind: 'followup1', status: 'sent', to: 'joe@joeplumbing.example', local_date: '2026-11-05' };
  const d7 = ml.dueFollowUps([first, f1], pipe, [], '2026-11-09', s, c);
  assert.deepStrictEqual(d7.map(x => x.kind), ['followup2']);
  const f2 = { kind: 'followup2', status: 'sent', to: 'joe@joeplumbing.example', local_date: '2026-11-09' };
  assert.strictEqual(ml.dueFollowUps([first, f1, f2], pipe, [], '2026-11-20', s, c).length, 0, 'sequence stops after 2');
});

t('quoted text is ignored, so our own footer never reads as an opt-out', () => {
  const text = 'Sounds good, how does it work?\n\nOn Thu, Nov 5, 2026 at 10:00 AM Sam <sam@testco.example> wrote:\n> Hi Joe\n> Not interested? Reply "no thanks" and I won\'t email again.';
  assert.strictEqual(ml.stripQuoted(text), 'Sounds good, how does it work?');
  assert.strictEqual(ml.classifyInbound({ from: 'joe@joeplumbing.example', subject: 'Re: Hello', text }).type, 'reply');
});

t('classifies bounces, auto-replies, opt-outs and complaints', () => {
  const b = ml.classifyInbound({ from: 'mailer-daemon@googlemail.com', subject: 'Delivery Status Notification (Failure)', text: 'Final-Recipient: rfc822; gone@biz.example\nStatus: 5.1.1' });
  assert.deepStrictEqual(b, { type: 'bounce', bouncedTo: 'gone@biz.example' });
  assert.strictEqual(ml.classifyInbound({ from: 'a@b.example', subject: 'Out of Office', text: 'Back Monday' }).type, 'auto_reply');
  assert.strictEqual(ml.classifyInbound({ from: 'a@b.example', subject: 'Re: x', text: 'hi', headers: { 'auto-submitted': 'auto-replied' } }).type, 'auto_reply');
  assert.strictEqual(ml.classifyInbound({ from: 'a@b.example', subject: 'Re: x', text: 'No thanks.' }).type, 'opt_out');
  assert.strictEqual(ml.classifyInbound({ from: 'a@b.example', subject: 'Re: x', text: 'Please remove me from your list' }).type, 'opt_out');
  assert.strictEqual(ml.classifyInbound({ from: 'a@b.example', subject: 'unsubscribe', text: '' }).type, 'opt_out');
  assert.strictEqual(ml.classifyInbound({ from: 'a@b.example', subject: 'Re: x', text: 'STOP' }).type, 'opt_out');
  assert.strictEqual(ml.classifyInbound({ from: 'a@b.example', subject: 'Re: x', text: 'This is spam.' }).type, 'complaint');
});

t('inbound changes: reply, opt-out, bounce and complaint update the right records', () => {
  const data = {
    pipeline: [{ business: 'Joe Plumbing', email: 'joe@joeplumbing.example' }, { business: 'Ann Salon', email: 'ann@annsalon.example' }],
    suppression: [],
    sentLog: [
      { to: 'joe@joeplumbing.example', business: 'Joe Plumbing', status: 'sent', message_id: '<j@t>', subject: 'Hi Joe' },
      { to: 'ann@annsalon.example', business: 'Ann Salon', status: 'sent', message_id: '<a@t>', subject: 'Hi Ann' },
      { to: 'gone@biz.example', business: 'Gone', status: 'sent', message_id: '<g@t>', subject: 'Hi' }
    ]
  };
  const items = [
    { msg: { from: 'joe@joeplumbing.example', subject: 'Re: Hi Joe', inReplyTo: '<j@t>', messageId: '<r1@x>' }, kind: { type: 'reply', text: 'How much?' } },
    { msg: { from: 'front-desk@annsalon.example', subject: 'Re: Hi Ann' }, kind: { type: 'opt_out' } },
    { msg: { from: 'mailer-daemon@x', subject: 'Undeliverable' }, kind: { type: 'bounce', bouncedTo: 'gone@biz.example' } }
  ];
  const r = ml.applyInbound(items, data, '2026-11-06');
  assert.strictEqual(r.pipeline[0].replied_on, '2026-11-06');
  assert.strictEqual(r.pipeline[1].unsubscribed, 'yes');
  assert.strictEqual(r.pipeline[1].lost_on, '2026-11-06');
  assert.strictEqual(r.pipeline[1].replied_on, undefined, 'opt-outs must not count as replies');
  assert.ok(r.suppression.some(s => s.email === 'ann@annsalon.example'));
  assert.ok(r.suppression.some(s => s.email === 'front-desk@annsalon.example'));
  assert.strictEqual(r.sentLog[2].status, 'bounced');
  assert.strictEqual(r.hotLeads.length, 1);
  assert.strictEqual(r.hotLeads[0].text, 'How much?');
  assert.strictEqual(data.pipeline[0].replied_on, undefined, 'input not mutated');
  const c = ml.applyInbound([{ msg: { from: 'joe@joeplumbing.example', subject: 'Re: Hi Joe', inReplyTo: '<j@t>' }, kind: { type: 'complaint' } }], data, '2026-11-06');
  assert.strictEqual(c.complaints.length, 1);
});

t('rendered email has threading and List-Unsubscribe headers', () => {
  const dir = makeWorkspace();
  const data = { config: baseConfig(), settings: ml.mailerSettings(baseConfig()), dir };
  const mail = mailer.buildMail(msg({ inReplyTo: '<orig@x>' }), data);
  const eml = mailer.renderEml(mail);
  assert.ok(eml.includes('In-Reply-To: <orig@x>'));
  assert.ok(eml.includes('List-Unsubscribe: <mailto:sam@testco.example?subject=unsubscribe>'));
  assert.ok(mail.messageId.endsWith('@testco.example>'));
  fs.rmSync(dir, { recursive: true, force: true });
});

t('SMTP errors: auth stops the run, 550 counts as a bounce', () => {
  assert.strictEqual(mailer.classifySmtpError({ code: 'EAUTH' }), 'fatal');
  assert.strictEqual(mailer.classifySmtpError({ code: 'EENVELOPE', responseCode: 550 }), 'bounce');
  assert.strictEqual(mailer.classifySmtpError({ code: 'EMESSAGE', responseCode: 451 }), 'failed');
});

// ---------- full CLI runs (fake transport and clock) ----------

t('dry run renders previews and changes no records', async () => {
  const dir = makeWorkspace();
  writeBatch(dir, '2026-11-05', [msg()]);
  const f = fakeIo(dir);
  await mailer.run(['approve', '2026-11-05', '--by', 'Sam'], f.io);
  const r = await mailer.run(['send'], f.io);
  assert.ok(r.text.includes('DRY RUN'));
  assert.ok(r.text.includes('would send first -> joe@joeplumbing.example'));
  assert.strictEqual(f.sent.length, 0);
  assert.ok(fs.existsSync(path.join(dir, 'sales/outbox/dry-run/2026-11-05/m1.eml')));
  assert.strictEqual(lib.parseCsv(fs.readFileSync(path.join(dir, 'sales/sent-log.csv'), 'utf8')).length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('approval: needs --by, refuses failing batches, and is voided by later edits', async () => {
  const dir = makeWorkspace();
  const f = fakeIo(dir);
  writeBatch(dir, '2026-11-05', [msg({ body: 'Hi [Owner first name]' })]);
  assert.strictEqual((await mailer.run(['approve', '2026-11-05'], f.io)).code, 1);
  assert.strictEqual((await mailer.run(['approve', '2026-11-05', '--by', 'Sam'], f.io)).code, 2);
  writeBatch(dir, '2026-11-05', [msg()]);
  assert.strictEqual((await mailer.run(['approve', '2026-11-05', '--by', 'Sam'], f.io)).code, 0);
  const p = path.join(dir, 'sales/outbox/2026-11-05.json');
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  b.messages[0].body += ' P.S. buy now';
  fs.writeFileSync(p, JSON.stringify(b));
  const r = await mailer.run(['send', '--live'], f.io);
  assert.ok(r.text.includes('CHANGED AFTER APPROVAL'));
  assert.strictEqual(f.sent.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('live send refuses when disabled, outside hours, or without credentials', async () => {
  const off = makeWorkspace(baseConfig({ enabled: false }));
  writeBatch(off, '2026-11-05', [msg()]);
  let f = fakeIo(off);
  await mailer.run(['approve', '2026-11-05', '--by', 'Sam'], f.io);
  assert.ok((await mailer.run(['send', '--live'], f.io)).text.includes('mailer.enabled is false'));

  const dir = makeWorkspace();
  writeBatch(dir, '2026-11-05', [msg()]);
  f = fakeIo(dir, { now: new Date('2026-11-07T15:00:00Z') });
  await mailer.run(['approve', '2026-11-05', '--by', 'Sam'], f.io);
  assert.strictEqual((await mailer.run(['send', '--live'], f.io)).code, 4);
  fs.writeFileSync(path.join(dir, '.env'), '');
  f.setNow(THU_10AM_ET);
  assert.ok((await mailer.run(['send', '--live'], f.io)).text.includes('MAILER_USER / MAILER_PASS missing'));
  assert.strictEqual(f.sent.length, 0);
  [off, dir].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
});

t('live send obeys the warm-up cap, logs every send, updates the pipeline, never double-sends', async () => {
  const dir = makeWorkspace();
  const batch = personalized(12);
  addProspects(dir, batch.map(m => ({ business: m.business, email: m.to })));
  writeBatch(dir, '2026-11-05', batch);
  const f = fakeIo(dir);
  await mailer.run(['approve', '2026-11-05', '--by', 'Sam'], f.io);
  const r1 = await mailer.run(['send', '--live'], f.io);
  assert.strictEqual(f.sent.length, 10, r1.text);
  assert.ok(r1.text.includes('2 message(s) wait for a later day'));
  assert.ok(f.sent[0].text.includes('PO Box 1, Town, ST 00000'));
  await mailer.run(['send', '--live'], f.io);
  assert.strictEqual(f.sent.length, 10, 'cap reached today');
  f.setNow(FRI_10AM_ET);
  await mailer.run(['send', '--live'], f.io);
  assert.strictEqual(f.sent.length, 12);
  await mailer.run(['send', '--live'], f.io);
  assert.strictEqual(f.sent.length, 12, 'nothing sent twice');
  const log = lib.parseCsv(fs.readFileSync(path.join(dir, 'sales/sent-log.csv'), 'utf8'));
  assert.strictEqual(log.length, 12);
  const pipe = lib.parseCsv(fs.readFileSync(path.join(dir, 'sales/pipeline.csv'), 'utf8'));
  assert.strictEqual(pipe.filter(p => p.contacted_on).length, 12);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('a rejected address becomes a bounce and is suppressed; auth failure stops the run', async () => {
  const dir = makeWorkspace();
  const batch = personalized(3);
  writeBatch(dir, '2026-11-05', batch);
  const bounce = Object.assign(new Error('550 5.1.1 user unknown'), { code: 'EENVELOPE', responseCode: 550 });
  const f = fakeIo(dir, { fail: { [batch[0].to]: bounce } });
  await mailer.run(['approve', '2026-11-05', '--by', 'Sam'], f.io);
  await mailer.run(['send', '--live'], f.io);
  assert.strictEqual(f.sent.length, 2);
  const sup = lib.parseCsv(fs.readFileSync(path.join(dir, 'sales/suppression.csv'), 'utf8'));
  assert.deepStrictEqual(sup.map(s => s.email), [batch[0].to]);

  const dir2 = makeWorkspace();
  writeBatch(dir2, '2026-11-05', personalized(3));
  const auth = Object.assign(new Error('Invalid login'), { code: 'EAUTH' });
  const f2 = fakeIo(dir2, { fail: { [personalized(1)[0].to]: auth } });
  await mailer.run(['approve', '2026-11-05', '--by', 'Sam'], f2.io);
  const r = await mailer.run(['send', '--live'], f2.io);
  assert.ok(r.text.includes('STOPPED: EAUTH'));
  assert.strictEqual(f2.sent.length, 0);
  [dir, dir2].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
});

t('high bounce rate pauses mid-run; only the founder can resume', async () => {
  const dir = makeWorkspace(baseConfig({ minSendsForBounceCheck: 2 }));
  const batch = personalized(5);
  writeBatch(dir, '2026-11-05', batch);
  const bounce = Object.assign(new Error('550 no such user'), { code: 'EENVELOPE', responseCode: 550 });
  const f = fakeIo(dir, { fail: { [batch[0].to]: bounce, [batch[1].to]: bounce } });
  await mailer.run(['approve', '2026-11-05', '--by', 'Sam'], f.io);
  const r = await mailer.run(['send', '--live'], f.io);
  assert.ok(r.text.includes('PAUSED'), r.text);
  assert.strictEqual(f.sent.length, 0);
  assert.strictEqual((await mailer.run(['send', '--live'], f.io)).code, 3);
  assert.strictEqual((await mailer.run(['resume'], f.io)).code, 1);
  assert.strictEqual((await mailer.run(['resume', '--by', 'Sam'], f.io)).code, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('follow-ups are generated, auto-approved, and sent threaded', async () => {
  const dir = makeWorkspace();
  addProspects(dir, [{ business: 'Joe Plumbing', email: 'joe@joeplumbing.example', contact_name: 'Joe' }]);
  writeBatch(dir, '2026-11-02', [msg()]);
  const f = fakeIo(dir, { now: new Date('2026-11-02T15:00:00Z') });
  await mailer.run(['approve', '2026-11-02', '--by', 'Sam'], f.io);
  await mailer.run(['send', '--live'], f.io);
  f.setNow(THU_10AM_ET);
  const g = await mailer.run(['followups'], f.io);
  assert.ok(g.text.includes('Added 1 follow-up'), g.text);
  assert.ok((await mailer.run(['followups'], f.io)).text.includes('No new follow-ups'));
  await mailer.run(['send', '--live'], f.io);
  assert.strictEqual(f.sent.length, 2);
  assert.strictEqual(f.sent[1].inReplyTo, f.sent[0].messageId);
  assert.ok(f.sent[1].subject.startsWith('Re: '));
  fs.rmSync(dir, { recursive: true, force: true });
});

t('inbox run records a reply, saves it for sales, and stops follow-ups', async () => {
  const dir = makeWorkspace();
  addProspects(dir, [{ business: 'Joe Plumbing', email: 'joe@joeplumbing.example', contact_name: 'Joe' }]);
  writeBatch(dir, '2026-11-02', [msg()]);
  const inbound = [];
  const f = fakeIo(dir, { now: new Date('2026-11-02T15:00:00Z'), imapFetch: async () => ({ messages: inbound, imapState: { uidValidity: '1', lastUid: 9 } }) });
  await mailer.run(['approve', '2026-11-02', '--by', 'Sam'], f.io);
  await mailer.run(['send', '--live'], f.io);
  inbound.push({ from: 'joe@joeplumbing.example', subject: 'Re: 3 reviews', text: 'Interesting! What does it cost?', inReplyTo: f.sent[0].messageId, messageId: '<reply1@joe>' });
  f.setNow(new Date('2026-11-03T15:00:00Z'));
  const r = await mailer.run(['inbox'], f.io);
  assert.ok(r.text.includes('1 reply(ies) to handle'), r.text);
  assert.ok(fs.readFileSync(path.join(dir, 'sales/inbox/2026-11-03.md'), 'utf8').includes('What does it cost?'));
  f.setNow(THU_10AM_ET);
  assert.ok((await mailer.run(['followups'], f.io)).text.includes('No new follow-ups'));
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'sales/mailer-state.json'), 'utf8'));
  assert.strictEqual(state.imap.lastUid, 9);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('credentials: .env is read but never overrides the real environment, and is git-ignored', () => {
  const dir = makeWorkspace();
  assert.strictEqual(mailer.credentials(dir, {}).user, 'sam@testco.example');
  assert.strictEqual(mailer.credentials(dir, { MAILER_USER: 'env@x.example' }).user, 'env@x.example');
  fs.rmSync(dir, { recursive: true, force: true });
  const ignore = fs.readFileSync(path.join(__dirname, '../../.gitignore'), 'utf8').split('\n');
  assert.ok(ignore.includes('.env'));
  for (const p of ['sales/sent-log.csv', 'sales/suppression.csv', 'sales/mailer-state.json', 'sales/inbox/']) {
    assert.ok(ignore.includes(`examples/ai-company/${p}`), p);
  }
});

t('dependencies are pinned to exact versions', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../examples/ai-company/package.json'), 'utf8'));
  for (const [name, v] of Object.entries(pkg.dependencies)) assert.ok(/^\d+\.\d+\.\d+$/.test(v), `${name}@${v}`);
});

async function main() {
  console.log('\n=== Testing ai-company mailer ===\n');
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
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
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
