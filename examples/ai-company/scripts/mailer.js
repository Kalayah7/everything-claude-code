#!/usr/bin/env node
/**
 * Outreach mailer: sends APPROVED batches from the founder's own mailbox, with hard limits,
 * and reads replies to stop follow-ups, record opt-outs and flag interested prospects.
 *
 * Usage (from examples/ai-company/):
 *   node scripts/mailer.js status                       Limits, quota, window, pending batches
 *   node scripts/mailer.js check [DATE]                 Run every safety check on a batch
 *   node scripts/mailer.js approve DATE --by NAME       Founder approves a batch (locks its content)
 *   node scripts/mailer.js followups                    Build today's follow-up batch
 *   node scripts/mailer.js send [--batch DATE] [--live] Dry run by default; --live really sends
 *   node scripts/mailer.js inbox [--file a.eml ...]     Read replies (IMAP, or local .eml files)
 *   node scripts/mailer.js test-connection              Log in to SMTP and IMAP, send nothing
 *   node scripts/mailer.js pause "reason" | resume --by NAME | complaint EMAIL
 *
 * Credentials come from MAILER_USER / MAILER_PASS (environment, or examples/ai-company/.env,
 * which is git-ignored). They are never printed or written anywhere else.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lib = require('./lib');
const ml = require('./mailer-lib');

const FILES = Object.freeze({
  sentLog: 'sales/sent-log.csv',
  suppression: 'sales/suppression.csv',
  pipeline: 'sales/pipeline.csv',
  state: 'sales/mailer-state.json',
  outbox: 'sales/outbox',
  inbox: 'sales/inbox'
});
const SENT_HEADER = ['sent_at', 'local_date', 'batch', 'message_id_local', 'message_id', 'kind', 'business', 'to', 'subject', 'status', 'error'];
const SUPPRESSION_HEADER = ['email', 'reason', 'date'];

// ---------- small I/O helpers ----------

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function loadEnvFile(dir, env) {
  const text = readText(path.join(dir, '.env'));
  const out = { ...env };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function credentials(dir, env) {
  const e = loadEnvFile(dir, env);
  return { user: e.MAILER_USER || '', pass: e.MAILER_PASS || '' };
}

function loadData(dir) {
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'company.config.json'), 'utf8'));
  const pipelineText = readText(path.join(dir, FILES.pipeline));
  const stateText = readText(path.join(dir, FILES.state));
  return {
    dir,
    config,
    settings: ml.mailerSettings(config),
    sentLog: lib.parseCsv(readText(path.join(dir, FILES.sentLog))),
    suppression: lib.parseCsv(readText(path.join(dir, FILES.suppression))),
    pipeline: lib.parseCsv(pipelineText),
    pipelineHeader: lib.csvHeader(pipelineText),
    state: stateText ? JSON.parse(stateText) : { paused: false, complaints: [] }
  };
}

function saveSentLog(dir, rows) { writeAtomic(path.join(dir, FILES.sentLog), lib.toCsv(SENT_HEADER, rows)); }
function saveSuppression(dir, rows) { writeAtomic(path.join(dir, FILES.suppression), lib.toCsv(SUPPRESSION_HEADER, rows)); }
function saveState(dir, state) { writeAtomic(path.join(dir, FILES.state), JSON.stringify(state, null, 2) + '\n'); }
function savePipeline(dir, header, rows) {
  if (header.length === 0) return;
  writeAtomic(path.join(dir, FILES.pipeline), lib.toCsv(header, rows));
}

// ---------- batches ----------

function batchPath(dir, name) {
  return path.join(dir, FILES.outbox, `${name}.json`);
}

function listBatches(dir) {
  const d = path.join(dir, FILES.outbox);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => /^\d{4}-\d{2}-\d{2}.*\.json$/.test(f)).map(f => f.replace(/\.json$/, '')).sort();
}

function readBatch(dir, name) {
  const p = batchPath(dir, name);
  if (!fs.existsSync(p)) throw new Error(`No batch file ${path.relative(dir, p)}`);
  const b = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(b.messages)) throw new Error(`${name}: "messages" must be an array`);
  return b;
}

function batchHash(batch) {
  const content = batch.messages.map(m => [m.id, m.kind || 'first', m.to, m.subject, m.body, m.inReplyTo || '']);
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 16);
}

function approvalState(batch) {
  if (!batch.approved) return 'not approved';
  if (batch.approvedHash !== batchHash(batch)) return 'CHANGED AFTER APPROVAL (re-approve)';
  return 'approved';
}

function checkBatch(data, batch) {
  const ctx = { config: data.config, settings: data.settings, suppression: data.suppression, pipeline: data.pipeline, sentLog: data.sentLog, batchMessages: batch.messages };
  const ids = new Set();
  return batch.messages.map(m => {
    const problems = ml.checkMessage(m, ctx);
    if (!m.id) problems.push('missing id');
    else if (ids.has(m.id)) problems.push(`duplicate id ${m.id}`);
    ids.add(m.id);
    return { msg: m, problems };
  });
}

// ---------- commands ----------

function cmdStatus(data, io) {
  const now = io.now();
  const local = ml.localParts(now, data.settings.timezone);
  const quota = ml.dailyQuota(data.sentLog, local.ymd, data.settings);
  const breaker = ml.breakerStatus(data.sentLog, data.state, data.settings);
  const creds = credentials(data.dir, io.env);
  const s = data.settings;
  const lines = [
    'MAILER STATUS',
    '='.repeat(60),
    `Enabled for live sending: ${s.enabled ? 'yes' : 'NO (set mailer.enabled=true in company.config.json)'}`,
    `From: ${s.fromName || '(fromName not set)'} <${s.fromEmail || 'fromEmail not set'}>`,
    `Provider: ${s.provider}  SMTP ${s.smtp.host || '?'}:${s.smtp.port || '?'}  IMAP ${s.imap.host || '?'}:${s.imap.port || '?'}`,
    `Credentials: ${creds.user && creds.pass ? `found for ${creds.user}` : 'MISSING (set MAILER_USER and MAILER_PASS in examples/ai-company/.env)'}`,
    `Paused: ${breaker.paused ? `YES - ${breaker.reason}` : 'no'}`,
    `Today (${local.ymd}, ${s.timezone}): sent ${quota.sentToday} of ${quota.cap} (warm-up week ${quota.week})`,
    `Send window now: ${ml.inSendWindow(now, s) ? 'OPEN' : 'closed'} (days ${s.sendWindow.days.join(',')}, ${s.sendWindow.startHour}:00-${s.sendWindow.endHour}:00)`,
    '',
    'Batches:'
  ];
  const batches = listBatches(data.dir);
  if (batches.length === 0) lines.push('  (none in sales/outbox/)');
  for (const name of batches) {
    const b = readBatch(data.dir, name);
    const sentIds = new Set(data.sentLog.filter(r => r.batch === name).map(r => r.message_id_local));
    lines.push(`  ${name}: ${b.messages.length} message(s), ${b.messages.filter(m => sentIds.has(m.id)).length} done, ${approvalState(b)}`);
  }
  const due = ml.dueFollowUps(data.sentLog, data.pipeline, data.suppression, local.ymd, s, data.config);
  lines.push('', `Follow-ups due today: ${due.length}${due.length ? ' (run: node scripts/mailer.js followups)' : ''}`);
  return { text: lines.join('\n'), code: 0 };
}

function cmdCheck(data, io, name) {
  const names = name ? [name] : listBatches(data.dir);
  const lines = [];
  let bad = 0;
  for (const n of names) {
    const b = readBatch(data.dir, n);
    const results = checkBatch(data, b);
    const failing = results.filter(r => r.problems.length > 0);
    bad += failing.length;
    lines.push(`${n}: ${results.length - failing.length}/${results.length} pass, ${approvalState(b)}`);
    for (const r of failing) lines.push(`  x ${r.msg.id || '(no id)'} -> ${r.msg.to || '?'}: ${r.problems.join('; ')}`);
  }
  if (names.length === 0) lines.push('No batches in sales/outbox/.');
  return { text: lines.join('\n'), code: bad > 0 ? 2 : 0 };
}

function cmdApprove(data, io, name, by) {
  if (!name) return { text: 'Usage: approve DATE --by NAME', code: 1 };
  if (!by || by === true) return { text: 'Approval needs --by "<founder name>". Only the founder approves batches.', code: 1 };
  const b = readBatch(data.dir, name);
  const failing = checkBatch(data, b).filter(r => r.problems.length > 0);
  if (failing.length > 0) {
    return { text: `Not approved: ${failing.length} message(s) fail checks. Run: node scripts/mailer.js check ${name}`, code: 2 };
  }
  const approved = { ...b, approved: true, approvedAt: io.now().toISOString(), approvedBy: String(by), approvedHash: batchHash(b) };
  writeAtomic(batchPath(data.dir, name), JSON.stringify(approved, null, 2) + '\n');
  return { text: `Approved ${name}: ${b.messages.length} message(s) by ${by}. Any later edit to the batch voids this approval.`, code: 0 };
}

function cmdFollowups(data, io) {
  const local = ml.localParts(io.now(), data.settings.timezone);
  const due = ml.dueFollowUps(data.sentLog, data.pipeline, data.suppression, local.ymd, data.settings, data.config);
  const name = `${local.ymd}-followups`;
  const p = batchPath(data.dir, name);
  const existing = fs.existsSync(p) ? readBatch(data.dir, name) : { date: local.ymd, type: 'followups', messages: [] };
  const known = new Set(existing.messages.map(m => m.id));
  const added = due.filter(m => !known.has(m.id));
  if (added.length === 0) return { text: `No new follow-ups due (${existing.messages.length} already in ${name}).`, code: 0 };
  let batch = { ...existing, messages: [...existing.messages, ...added] };
  if (data.settings.autoApproveFollowUps) {
    batch = { ...batch, approved: true, approvedAt: io.now().toISOString(), approvedBy: 'auto (mailer.autoApproveFollowUps)', approvedHash: batchHash(batch) };
  } else {
    batch = { ...batch, approved: false, approvedHash: '' };
  }
  writeAtomic(p, JSON.stringify(batch, null, 2) + '\n');
  return { text: `Added ${added.length} follow-up(s) to ${name} (${batch.approved ? 'auto-approved' : 'needs approval'}).`, code: 0 };
}

function renderEml(mail) {
  const h = [
    `From: ${mail.from}`, `To: ${mail.to}`, `Subject: ${mail.subject}`, `Message-ID: ${mail.messageId}`,
    mail.inReplyTo ? `In-Reply-To: ${mail.inReplyTo}` : '', mail.references ? `References: ${mail.references}` : '',
    mail.replyTo ? `Reply-To: ${mail.replyTo}` : '', `List-Unsubscribe: ${mail.headers['List-Unsubscribe']}`,
    'Content-Type: text/plain; charset=utf-8'
  ].filter(Boolean);
  return `${h.join('\r\n')}\r\n\r\n${mail.text.replace(/\n/g, '\r\n')}\r\n`;
}

function buildMail(msg, data) {
  const s = data.settings;
  const domain = ml.emailDomain(s.fromEmail) || 'localhost';
  const unsubscribeTo = s.replyTo || s.fromEmail;
  return {
    from: `"${String(s.fromName || data.config.company.name).replace(/"/g, '')}" <${s.fromEmail}>`,
    to: msg.to,
    replyTo: s.replyTo || undefined,
    subject: msg.subject,
    text: ml.withFooter(msg.body, data.config),
    messageId: `<${ml.slug(msg.id)}.${crypto.randomBytes(6).toString('hex')}@${domain}>`,
    inReplyTo: msg.inReplyTo || undefined,
    references: msg.inReplyTo || undefined,
    headers: { 'List-Unsubscribe': `<mailto:${unsubscribeTo}?subject=unsubscribe>` }
  };
}

function nodemailerTransport(settings, creds) {
  const nodemailer = require('nodemailer');
  const local = ml.isLocalHost(settings.smtp.host);
  const t = nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure,
    requireTLS: !settings.smtp.secure && !local,
    ignoreTLS: local && !settings.smtp.secure,
    auth: creds.user ? { user: creds.user, pass: creds.pass } : undefined
  });
  return {
    send: async mail => (await t.sendMail(mail)),
    verify: async () => t.verify(),
    close: () => t.close()
  };
}

function classifySmtpError(err) {
  const code = err && (err.code || '');
  const rc = Number(err && err.responseCode);
  if (['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ETLS'].includes(code)) return 'fatal';
  if (code === 'EENVELOPE' && rc >= 500 && rc < 600) return 'bounce';
  if (rc >= 550 && rc <= 554) return 'bounce';
  return 'failed';
}

async function cmdSend(data, io, opts) {
  const live = opts.live === true;
  const s = data.settings;
  const lines = [live ? 'SEND (LIVE)' : 'SEND (DRY RUN: nothing leaves this computer)', '='.repeat(60)];

  const breaker = ml.breakerStatus(data.sentLog, data.state, s);
  if (breaker.paused) {
    if (!data.state.paused) saveState(data.dir, { ...data.state, paused: true, pausedReason: breaker.reason, pausedAt: io.now().toISOString() });
    return { text: `${lines.join('\n')}\nPAUSED: ${breaker.reason}. Nothing sent. The founder must review and run: resume --by NAME`, code: 3 };
  }
  if (live) {
    const creds = credentials(data.dir, io.env);
    const missing = [
      !s.enabled && 'mailer.enabled is false',
      !s.fromEmail && 'mailer.fromEmail not set',
      !s.smtp.host && 'SMTP host not set',
      !(creds.user && creds.pass) && 'MAILER_USER / MAILER_PASS missing'
    ].filter(Boolean);
    if (missing.length) return { text: `${lines.join('\n')}\nCannot send live: ${missing.join('; ')}.`, code: 1 };
    if (!ml.inSendWindow(io.now(), s)) return { text: `${lines.join('\n')}\nOutside the send window. Nothing sent. Try again during business hours.`, code: 4 };
  }

  const names = opts.batch ? [opts.batch] : listBatches(data.dir);
  const queue = [];
  for (const n of names) {
    const b = readBatch(data.dir, n);
    const appr = approvalState(b);
    if (appr !== 'approved') { lines.push(`skip ${n}: ${appr}`); continue; }
    for (const r of checkBatch(data, b)) {
      const done = data.sentLog.some(x => x.message_id_local === r.msg.id && ['sent', 'bounced'].includes(x.status));
      if (done) continue;
      if (r.problems.length) { lines.push(`  blocked ${r.msg.id}: ${r.problems.join('; ')}`); continue; }
      queue.push({ batch: n, msg: r.msg });
    }
  }
  // Follow-ups and replies first: they are time-sensitive and keep threads coherent.
  const order = { reply: 0, followup1: 1, followup2: 1, first: 2 };
  queue.sort((a, b) => (order[a.msg.kind || 'first'] - order[b.msg.kind || 'first']));

  const local = ml.localParts(io.now(), s.timezone);
  const quota = ml.dailyQuota(data.sentLog, local.ymd, s);
  const todo = queue.slice(0, quota.remaining);
  lines.push(`Ready: ${queue.length}. Daily cap ${quota.cap} (warm-up week ${quota.week}), already sent today ${quota.sentToday}. This run: ${todo.length}.`);
  if (queue.length > todo.length) lines.push(`${queue.length - todo.length} message(s) wait for a later day (daily cap).`);

  if (!live) {
    lines.push(`Send window now: ${ml.inSendWindow(io.now(), s) ? 'open' : 'closed (a live run now would wait)'}`);
    const outDir = path.join(data.dir, FILES.outbox, 'dry-run', local.ymd);
    for (const { msg } of todo) {
      const mail = buildMail(msg, data);
      writeAtomic(path.join(outDir, `${ml.slug(msg.id)}.eml`), renderEml(mail));
      lines.push(`  would send ${msg.kind || 'first'} -> ${msg.to}: "${msg.subject}"`);
    }
    if (todo.length) lines.push(`Preview files: ${path.relative(data.dir, outDir)}/`);
    return { text: lines.join('\n'), code: 0 };
  }

  const transport = io.transportFactory(s, credentials(data.dir, io.env));
  const delay = ml.effectiveDelay(s);
  let sentLog = [...data.sentLog];
  let suppression = [...data.suppression];
  let pipeline = [...data.pipeline];
  let sentCount = 0;
  try {
    for (let i = 0; i < todo.length; i++) {
      const { batch, msg } = todo[i];
      if (!ml.inSendWindow(io.now(), s)) { lines.push('Send window closed; stopping. The rest goes out next run.'); break; }
      // Re-check against this run's sends too (e.g. the same address in two batches).
      const late = ml.checkMessage(msg, { config: data.config, settings: s, suppression, pipeline, sentLog, batchMessages: null });
      if (late.length) { lines.push(`  blocked ${msg.id}: ${late.join('; ')}`); continue; }
      const mail = buildMail(msg, data);
      const at = io.now();
      const row = {
        sent_at: at.toISOString(), local_date: ml.localParts(at, s.timezone).ymd, batch, message_id_local: msg.id,
        message_id: mail.messageId, kind: msg.kind || 'first', business: msg.business || '', to: msg.to, subject: msg.subject, status: 'sent', error: ''
      };
      try {
        await transport.send(mail);
        sentCount++;
        lines.push(`  sent ${row.kind} -> ${msg.to}`);
        if (row.kind === 'first') {
          pipeline = pipeline.map(p => (
            (ml.normEmail(p.email) === ml.normEmail(msg.to) || (!p.email && p.business === msg.business)) && !p.contacted_on
              ? { ...p, contacted_on: row.local_date, email: p.email || msg.to }
              : p));
        }
      } catch (err) {
        const kind = classifySmtpError(err);
        if (kind === 'fatal') { lines.push(`STOPPED: ${err.code || 'error'}: ${String(err.message).split('\n')[0]}`); break; }
        row.status = kind === 'bounce' ? 'bounced' : 'failed';
        row.error = String(err.message || err).split('\n')[0].slice(0, 200);
        if (kind === 'bounce') suppression = [...suppression, { email: ml.normEmail(msg.to), reason: 'bounced', date: row.local_date }];
        lines.push(`  ${row.status} -> ${msg.to}: ${row.error}`);
      }
      sentLog = [...sentLog, row];
      // Save after every message so a crash can never cause a double send.
      saveSentLog(data.dir, sentLog);
      saveSuppression(data.dir, suppression);
      savePipeline(data.dir, data.pipelineHeader, pipeline);

      const b2 = ml.breakerStatus(sentLog, data.state, s);
      if (b2.paused) {
        saveState(data.dir, { ...data.state, paused: true, pausedReason: b2.reason, pausedAt: io.now().toISOString() });
        lines.push(`PAUSED: ${b2.reason}`);
        break;
      }
      if (i < todo.length - 1) await io.sleep(ml.randomDelayMs(delay));
    }
  } finally {
    if (transport.close) transport.close();
  }
  lines.push(`Done: ${sentCount} sent.`);
  return { text: lines.join('\n'), code: 0 };
}

function hotLeadsMarkdown(leads, ymd) {
  const parts = [`# Replies to handle (${ymd})`, ''];
  for (const l of leads) {
    parts.push(`## ${l.business || l.from}`, `- From: ${l.from}`, `- Subject: ${l.subject}`, `- Thread id: ${l.inReplyTo}`, '', '> ' + String(l.text || '').split('\n').join('\n> '), '');
  }
  return parts.join('\n');
}

function applyInboundAndSave(data, io, inbound) {
  const ymd = ml.localParts(io.now(), data.settings.timezone).ymd;
  const own = ml.normEmail(data.settings.fromEmail);
  const items = inbound.filter(m => ml.normEmail(m.from) !== own).map(msg => ({ msg, kind: ml.classifyInbound(msg) }));
  const r = ml.applyInbound(items, data, ymd);
  saveSentLog(data.dir, r.sentLog);
  saveSuppression(data.dir, r.suppression);
  savePipeline(data.dir, data.pipelineHeader, r.pipeline);
  let state = data.state;
  if (r.complaints.length) {
    state = { ...state, complaints: [...(state.complaints || []), ...r.complaints], paused: true, pausedReason: 'spam complaint recorded', pausedAt: io.now().toISOString() };
  }
  saveState(data.dir, state);
  if (r.hotLeads.length) {
    const f = path.join(data.dir, FILES.inbox, `${ymd}.md`);
    const prev = readText(f);
    writeAtomic(f, (prev ? prev + '\n' : '') + hotLeadsMarkdown(r.hotLeads, ymd));
  }
  const lines = [`Processed ${items.length} message(s): ${r.hotLeads.length} reply(ies) to handle, ${r.complaints.length} complaint(s).`, ...r.notes.map(n => `  ${n}`)];
  if (r.hotLeads.length) lines.push(`Replies saved to ${FILES.inbox}/${ymd}.md for company-sales to draft answers.`);
  return lines.join('\n');
}

async function parseEml(source) {
  const { simpleParser } = require('mailparser');
  const p = await simpleParser(source);
  const header = name => {
    const v = p.headers.get(name);
    return v === undefined ? '' : (typeof v === 'object' && v.value !== undefined ? String(v.value) : String(v));
  };
  return {
    from: (p.from && p.from.value && p.from.value[0] && p.from.value[0].address) || '',
    subject: p.subject || '',
    text: p.text || '',
    messageId: p.messageId || '',
    inReplyTo: p.inReplyTo || '',
    references: p.references || [],
    headers: { 'auto-submitted': header('auto-submitted'), 'x-autoreply': header('x-autoreply'), 'x-autorespond': header('x-autorespond') }
  };
}

async function fetchImap(data, io) {
  const { ImapFlow } = require('imapflow');
  const creds = credentials(data.dir, io.env);
  const s = data.settings;
  const client = new ImapFlow({ host: s.imap.host, port: s.imap.port, secure: s.imap.secure, auth: { user: creds.user, pass: creds.pass }, logger: false });
  await client.connect();
  const out = [];
  let imapState = data.state.imap || {};
  const lock = await client.getMailboxLock('INBOX');
  try {
    const validity = String(client.mailbox.uidValidity);
    let range;
    if (imapState.uidValidity === validity && imapState.lastUid) {
      range = `${Number(imapState.lastUid) + 1}:*`;
    } else {
      const since = new Date(io.now().getTime() - 14 * 86400000);
      const uids = await client.search({ since }, { uid: true });
      range = uids && uids.length ? uids.join(',') : null;
    }
    let maxUid = Number(imapState.lastUid || 0);
    if (range) {
      for await (const m of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        if (Number(m.uid) <= Number(imapState.lastUid || 0) && imapState.uidValidity === validity) continue;
        out.push(await parseEml(m.source));
        maxUid = Math.max(maxUid, Number(m.uid));
      }
    }
    imapState = { uidValidity: validity, lastUid: maxUid };
  } finally {
    lock.release();
    await client.logout();
  }
  return { messages: out, imapState };
}

async function cmdInbox(data, io, opts) {
  if (opts.files.length > 0) {
    const msgs = [];
    for (const f of opts.files) msgs.push(await parseEml(fs.readFileSync(f)));
    return { text: applyInboundAndSave(data, io, msgs), code: 0 };
  }
  const creds = credentials(data.dir, io.env);
  if (!(creds.user && creds.pass) || !data.settings.imap.host) {
    return { text: 'Cannot read the inbox: set MAILER_USER / MAILER_PASS and the IMAP host first.', code: 1 };
  }
  const { messages, imapState } = await (io.imapFetch || fetchImap)(data, io);
  const text = applyInboundAndSave(data, io, messages);
  const fresh = loadData(data.dir);
  saveState(data.dir, { ...fresh.state, imap: imapState });
  return { text, code: 0 };
}

async function cmdTestConnection(data, io) {
  const creds = credentials(data.dir, io.env);
  if (!(creds.user && creds.pass)) return { text: 'MAILER_USER / MAILER_PASS missing.', code: 1 };
  const lines = [];
  try {
    const t = io.transportFactory(data.settings, creds);
    await t.verify();
    if (t.close) t.close();
    lines.push(`SMTP login OK (${data.settings.smtp.host})`);
  } catch (err) {
    lines.push(`SMTP login FAILED: ${String(err.message).split('\n')[0]}`);
  }
  try {
    const { ImapFlow } = require('imapflow');
    const s = data.settings;
    const c = new ImapFlow({ host: s.imap.host, port: s.imap.port, secure: s.imap.secure, auth: creds, logger: false });
    await c.connect();
    await c.logout();
    lines.push(`IMAP login OK (${s.imap.host})`);
  } catch (err) {
    lines.push(`IMAP login FAILED: ${String(err.message).split('\n')[0]}`);
  }
  return { text: lines.join('\n'), code: lines.some(l => l.includes('FAILED')) ? 2 : 0 };
}

function cmdPause(data, io, reason) {
  saveState(data.dir, { ...data.state, paused: true, pausedReason: String(reason || 'paused by founder'), pausedAt: io.now().toISOString() });
  return { text: 'Mailer paused.', code: 0 };
}

function cmdResume(data, io, by) {
  if (!by || by === true) return { text: 'Resume needs --by "<founder name>". Only the founder resumes after a pause.', code: 1 };
  saveState(data.dir, { ...data.state, paused: false, pausedReason: '', complaints: [], resumedBy: String(by), resumedAt: io.now().toISOString() });
  const b = ml.breakerStatus(data.sentLog, { paused: false, complaints: [] }, data.settings);
  const warn = b.paused ? `\nWarning: ${b.reason}. Sending will pause again until the bounce rate drops. Clean the prospect list first.` : '';
  return { text: `Mailer resumed by ${by}.${warn}`, code: 0 };
}

function cmdComplaint(data, io, email) {
  if (!email) return { text: 'Usage: complaint EMAIL', code: 1 };
  const ymd = ml.localParts(io.now(), data.settings.timezone).ymd;
  const suppression = [...data.suppression, { email: ml.normEmail(email), reason: 'complaint', date: ymd }];
  saveSuppression(data.dir, suppression);
  saveState(data.dir, { ...data.state, paused: true, pausedReason: 'spam complaint recorded', pausedAt: io.now().toISOString(), complaints: [...(data.state.complaints || []), { email: ml.normEmail(email), date: ymd }] });
  return { text: `Recorded complaint from ${email}. Mailer paused until the founder resumes it.`, code: 0 };
}

function parseArgs(argv) {
  const args = { _: [], files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') { args.files.push(argv[++i]); continue; }
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args[a.slice(2)] = next; i++; } else { args[a.slice(2)] = true; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

async function run(argv, io) {
  const args = parseArgs(argv);
  const data = loadData(io.dir);
  const [cmd, arg] = args._;
  switch (cmd || 'status') {
    case 'status': return cmdStatus(data, io);
    case 'check': return cmdCheck(data, io, arg);
    case 'approve': return cmdApprove(data, io, arg, args.by);
    case 'followups': return cmdFollowups(data, io);
    case 'send': return cmdSend(data, io, { live: args.live === true, batch: args.batch });
    case 'inbox': return cmdInbox(data, io, { files: args.files });
    case 'test-connection': return cmdTestConnection(data, io);
    case 'pause': return cmdPause(data, io, arg);
    case 'resume': return cmdResume(data, io, args.by);
    case 'complaint': return cmdComplaint(data, io, arg);
    default: return { text: `Unknown command "${cmd}".`, code: 1 };
  }
}

function defaultIo(dir) {
  return {
    dir,
    env: process.env,
    now: () => new Date(),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    transportFactory: nodemailerTransport
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dirIdx = argv.indexOf('--dir');
  const dir = path.resolve(dirIdx !== -1 ? argv[dirIdx + 1] : path.join(__dirname, '..'));
  const rest = dirIdx !== -1 ? [...argv.slice(0, dirIdx), ...argv.slice(dirIdx + 2)] : argv;
  run(rest, defaultIo(dir)).then(r => {
    process.stdout.write(r.text + '\n');
    process.exitCode = r.code;
  }).catch(err => {
    const hint = err.code === 'MODULE_NOT_FOUND' ? '\nRun "npm install" in examples/ai-company first.' : '';
    process.stderr.write(`Error: ${err.message}${hint}\n`);
    process.exitCode = 1;
  });
}

module.exports = { run, parseArgs, batchHash, approvalState, buildMail, renderEml, classifySmtpError, loadEnvFile, credentials, SENT_HEADER, SUPPRESSION_HEADER, FILES };
