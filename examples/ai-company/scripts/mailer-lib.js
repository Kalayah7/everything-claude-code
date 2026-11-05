/**
 * Pure logic for the outreach mailer: checks, limits, follow-ups and reply handling.
 *
 * No network and no dependencies here, so every rule is unit tested.
 * The CLI (mailer.js) does the I/O and calls these functions.
 */

'use strict';

const PROVIDER_PRESETS = Object.freeze({
  google: { smtp: { host: 'smtp.gmail.com', port: 465, secure: true }, imap: { host: 'imap.gmail.com', port: 993, secure: true } },
  microsoft: { smtp: { host: 'smtp.office365.com', port: 587, secure: false }, imap: { host: 'outlook.office365.com', port: 993, secure: true } },
  zoho: { smtp: { host: 'smtp.zoho.com', port: 465, secure: true }, imap: { host: 'imap.zoho.com', port: 993, secure: true } }
});

const DEFAULTS = Object.freeze({
  enabled: false,
  provider: 'google',
  timezone: 'America/New_York',
  sendWindow: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 16 },
  maxPerDay: 40,
  warmup: [10, 20, 30],
  delaySeconds: { min: 60, max: 180 },
  followUpDays: [3, 7],
  autoApproveFollowUps: true,
  maxBounceRate: 0.05,
  minSendsForBounceCheck: 20,
  bounceWindow: 50,
  maxBodyChars: 2500
});

const OPT_OUT_LINE = 'Not interested? Reply "no thanks" and I won\'t email again.';
const KINDS = Object.freeze(['first', 'followup1', 'followup2', 'reply']);
const MIN_DELAY_SECONDS = 30;

function mailerSettings(config) {
  const m = { ...DEFAULTS, ...(config.mailer || {}) };
  const preset = PROVIDER_PRESETS[m.provider] || {};
  const smtp = { ...(preset.smtp || {}), ...pickSet(m.smtp) };
  const imap = { ...(preset.imap || {}), ...pickSet(m.imap) };
  return Object.freeze({ ...m, smtp, imap });
}

function pickSet(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}

function isLocalHost(host) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(host || '').toLowerCase());
}

/** Delays have a 30s floor so a config typo cannot turn the mailer into a blaster. Local test servers are exempt. */
function effectiveDelay(settings) {
  const floor = isLocalHost(settings.smtp.host) ? 0 : MIN_DELAY_SECONDS;
  const min = Math.max(floor, Number(settings.delaySeconds.min) || 0);
  const max = Math.max(min, Number(settings.delaySeconds.max) || 0);
  return { min, max };
}

function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  return at === -1 ? '' : String(email).slice(at + 1).toLowerCase();
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[a-z]{2,}$/i;

function buildFooter(config) {
  const m = config.mailer || {};
  const name = m.fromName || config.company.ownerName || '';
  return [
    '--',
    `${name} | ${config.company.name}`.trim(),
    config.company.postalAddress,
    OPT_OUT_LINE
  ].join('\n');
}

function withFooter(body, config) {
  const footer = buildFooter(config);
  const trimmed = String(body || '').replace(/\s+$/, '');
  return trimmed.includes(OPT_OUT_LINE) ? trimmed : `${trimmed}\n\n${footer}`;
}

/** Is this address suppressed (opted out, bounced, complained), by exact email or by domain rule? */
function isSuppressed(email, suppressionRows, pipelineRows) {
  const e = normEmail(email);
  const d = emailDomain(e);
  const bySuppression = suppressionRows.some(r => {
    const se = normEmail(r.email);
    return se === e || (se.startsWith('@') && se.slice(1) === d);
  });
  const byPipeline = pipelineRows.some(r => normEmail(r.email) === e && String(r.unsubscribed).toLowerCase() === 'yes');
  return bySuppression || byPipeline;
}

/**
 * Every rule a message must pass before it can be sent. Returns a list of
 * problems; an empty list means the message may be sent.
 */
function checkMessage(msg, ctx) {
  const { config, settings, suppression, pipeline, sentLog, batchMessages } = ctx;
  const problems = [];
  const kind = msg.kind || 'first';
  const body = String(msg.body || '');
  const finalBody = withFooter(body, config);

  if (!KINDS.includes(kind)) problems.push(`unknown kind "${kind}"`);
  if (!EMAIL_RE.test(String(msg.to || ''))) problems.push(`invalid recipient "${msg.to || ''}"`);
  if (!String(msg.subject || '').trim()) problems.push('empty subject');
  if (!body.trim()) problems.push('empty body');
  if (kind === 'first' && /^\s*(re|fwd?|fw)\s*:/i.test(msg.subject || '')) {
    problems.push('first email subject must not pretend to be a reply or forward (Re:/Fwd:)');
  }
  if (kind === 'first' && !String(msg.toSource || '').trim()) {
    problems.push('first email needs toSource: the public page where the business published this address');
  }
  const leftovers = (subjectAndBody(msg).match(/\[[^\]\n]{1,60}\]|\{\{[^}]+\}\}/g) || []);
  if (leftovers.length > 0) problems.push(`unfilled placeholders: ${[...new Set(leftovers)].join(', ')}`);
  if (msg.attachments && msg.attachments.length) problems.push('attachments are not allowed');
  if (body.length > settings.maxBodyChars) problems.push(`body too long (${body.length} > ${settings.maxBodyChars} chars)`);
  if (!config.company.postalAddress || !finalBody.includes(config.company.postalAddress)) {
    problems.push('postal address missing (set company.postalAddress)');
  }
  if (!finalBody.includes(OPT_OUT_LINE)) problems.push('opt-out line missing');
  if (msg.to && isSuppressed(msg.to, suppression, pipeline)) problems.push('recipient opted out, bounced, or complained');

  const to = normEmail(msg.to);
  const alreadySent = sentLog.filter(r => normEmail(r.to) === to && r.status === 'sent');
  if (sentLog.some(r => r.message_id_local === msg.id && r.status === 'sent')) {
    problems.push('already sent');
  } else if (kind === 'first' && alreadySent.length > 0) {
    problems.push('this address was already contacted');
  } else if (kind !== 'first' && kind !== 'reply' && alreadySent.some(r => r.kind === kind)) {
    problems.push(`${kind} already sent to this address`);
  }

  if (kind === 'first' && batchMessages) {
    const twins = batchMessages.filter(o => o !== msg && o.kind !== 'followup1' && o.kind !== 'followup2' &&
      normalizeText(o.body) === normalizeText(body));
    if (twins.length > 0) problems.push('same body as another message in the batch; personalize each email');
  }
  return problems;
}

function subjectAndBody(msg) {
  return `${msg.subject || ''}\n${msg.body || ''}`;
}

function normalizeText(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Local calendar parts of a Date in the given IANA time zone. */
function localParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short'
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const hour = Number(parts.hour) % 24;
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hour, minute: Number(parts.minute), weekday };
}

function inSendWindow(date, settings) {
  const p = localParts(date, settings.timezone);
  const w = settings.sendWindow;
  return w.days.includes(p.weekday) && p.hour >= w.startHour && p.hour < w.endHour;
}

function daysBetween(ymdA, ymdB) {
  const a = Date.UTC(...ymdA.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const b = Date.UTC(...ymdB.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((b - a) / 86400000);
}

/**
 * Daily cap with warm-up: week 1 uses warmup[0], week 2 warmup[1], and so on,
 * counted from the first day anything was sent. Never above maxPerDay.
 */
function dailyQuota(sentLog, todayYmd, settings) {
  const sent = sentLog.filter(r => r.status === 'sent' || r.status === 'bounced');
  const firstDay = sent.map(r => r.local_date).filter(Boolean).sort()[0];
  const week = firstDay ? Math.floor(daysBetween(firstDay, todayYmd) / 7) : 0;
  const step = settings.warmup[week];
  const cap = Math.min(settings.maxPerDay, step === undefined ? settings.maxPerDay : step);
  const sentToday = sent.filter(r => r.local_date === todayYmd).length;
  return { cap, sentToday, remaining: Math.max(0, cap - sentToday), week: week + 1 };
}

/** Auto-pause rule: any complaint, or too many bounces in the recent window. */
function breakerStatus(sentLog, state, settings) {
  if (state.paused) return { paused: true, reason: state.pausedReason || 'paused' };
  if ((state.complaints || []).length > 0) return { paused: true, reason: 'spam complaint recorded' };
  const recent = sentLog.filter(r => r.status === 'sent' || r.status === 'bounced').slice(-settings.bounceWindow);
  const bounces = recent.filter(r => r.status === 'bounced').length;
  if (recent.length >= settings.minSendsForBounceCheck && bounces / recent.length > settings.maxBounceRate) {
    return { paused: true, reason: `bounce rate ${(100 * bounces / recent.length).toFixed(1)}% over the last ${recent.length} sends` };
  }
  return { paused: false, reason: '' };
}

function firstName(full) {
  const f = String(full || '').trim().split(/\s+/)[0];
  return f || 'there';
}

function followUpBody(step, prospect, config) {
  const name = firstName(prospect.contact_name);
  if (step === 1) {
    return `Hi ${name}, just making sure this reached you. The replies above are ready to paste. ` +
      'If someone else handles your Google profile, could you forward this to them?';
  }
  const site = config.company.website ? ` Here's the page: ${config.company.website}.` : '';
  return `Hi ${name}, last note from me. If you ever want your Google reviews answered automatically, ` +
    `just reply to this email.${site} Either way, all the best with ${prospect.business}.`;
}

/**
 * Follow-ups due today: first emails sent N days ago (followUpDays), with no reply,
 * no opt-out, no bounce, and that follow-up not already sent.
 */
function dueFollowUps(sentLog, pipeline, suppression, todayYmd, settings, config) {
  const firsts = sentLog.filter(r => r.kind === 'first' && r.status === 'sent');
  const due = [];
  for (const first of firsts) {
    const to = normEmail(first.to);
    const prospect = pipeline.find(p => normEmail(p.email) === to) || { business: first.business, contact_name: '' };
    if (prospect.replied_on || prospect.won_on || prospect.lost_on) continue;
    if (isSuppressed(to, suppression, pipeline)) continue;
    if (sentLog.some(r => normEmail(r.to) === to && r.status === 'bounced')) continue;
    const age = daysBetween(first.local_date, todayYmd);
    settings.followUpDays.forEach((days, idx) => {
      const kind = `followup${idx + 1}`;
      const done = sentLog.some(r => normEmail(r.to) === to && r.kind === kind && r.status === 'sent');
      const previousDone = idx === 0 || sentLog.some(r => normEmail(r.to) === to && r.kind === `followup${idx}` && r.status === 'sent');
      if (!done && previousDone && age >= days && (idx + 1 >= settings.followUpDays.length || age < settings.followUpDays[idx + 1])) {
        due.push({
          id: `${todayYmd}-${slug(first.business || to)}-${kind}`,
          kind,
          business: first.business,
          to: first.to,
          subject: /^re:/i.test(first.subject) ? first.subject : `Re: ${first.subject}`,
          inReplyTo: first.message_id,
          body: followUpBody(idx + 1, prospect, config)
        });
      }
    });
  }
  return due;
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
}

/** Remove quoted history so we classify only what the person actually wrote. */
function stripQuoted(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    if (/^On .{4,200}wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*(Original Message|Forwarded message)/i.test(line.trim())) break;
    if (/^From:\s.+/.test(line.trim()) && out.length > 0) break;
    if (line.trim().startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

const OPT_OUT_RE = /\b(unsubscribe|remove me|take me off|no thanks|no thank you|not interested|stop emailing|do not (email|contact)|don't (email|contact))\b|^\s*stop\s*[.!]?\s*$/im;
const COMPLAINT_RE = /\b(spam|reported you|reporting you|harass)/i;

/**
 * Classify one inbound email.
 * msg: { from, subject, text, headers: { 'auto-submitted', 'x-autoreply', ... }, inReplyTo, references }
 */
function classifyInbound(msg) {
  const from = normEmail(msg.from);
  const subject = String(msg.subject || '');
  const headers = msg.headers || {};
  const fresh = stripQuoted(msg.text);

  if (/^(mailer-daemon|postmaster)@/.test(from) || /(undeliver|delivery status notification|delivery has failed|returned mail|failure notice|address not found)/i.test(subject)) {
    return { type: 'bounce', bouncedTo: extractBouncedRecipient(msg.text) };
  }
  const auto = String(headers['auto-submitted'] || '').toLowerCase();
  if ((auto && auto !== 'no') || headers['x-autoreply'] || headers['x-autorespond'] ||
      /^(auto(matic)?[- ]?reply|out of (the )?office|ooo\b|away from)/i.test(subject)) {
    return { type: 'auto_reply' };
  }
  if (/^\s*unsubscribe\b/i.test(subject) || OPT_OUT_RE.test(fresh.slice(0, 400))) return { type: 'opt_out' };
  if (COMPLAINT_RE.test(fresh.slice(0, 400))) return { type: 'complaint' };
  return { type: 'reply', text: fresh };
}

function extractBouncedRecipient(text) {
  const t = String(text || '');
  const m = t.match(/Final-Recipient:\s*rfc822;\s*<?([^\s>]+@[^\s>]+)>?/i) ||
    t.match(/Original-Recipient:\s*rfc822;\s*<?([^\s>]+@[^\s>]+)>?/i) ||
    t.match(/(?:to|recipient|address)[^@\n]{0,40}?<?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?/i);
  return m ? normEmail(m[1]) : '';
}

/** Which sent email does this inbound message belong to? By thread headers first, then by sender. */
function matchSent(msg, sentLog) {
  const ids = [msg.inReplyTo, ...(Array.isArray(msg.references) ? msg.references : String(msg.references || '').split(/\s+/))]
    .filter(Boolean);
  const byThread = sentLog.find(r => r.message_id && ids.includes(r.message_id));
  if (byThread) return byThread;
  const from = normEmail(msg.from);
  const sent = sentLog.filter(r => r.status === 'sent');
  return sent.find(r => normEmail(r.to) === from) ||
    sent.find(r => emailDomain(r.to) && emailDomain(r.to) === emailDomain(from) && !isFreeMail(from)) || null;
}

const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'proton.me', 'protonmail.com']);
function isFreeMail(email) {
  return FREE_MAIL.has(emailDomain(email));
}

/**
 * Turn classified inbound mail into record changes. Pure: returns new arrays.
 * Returns { pipeline, suppression, sentLog, complaints, hotLeads, notes }.
 */
function applyInbound(items, data, todayYmd) {
  let pipeline = data.pipeline.map(r => ({ ...r }));
  let suppression = data.suppression.map(r => ({ ...r }));
  let sentLog = data.sentLog.map(r => ({ ...r }));
  const complaints = [];
  const hotLeads = [];
  const notes = [];

  const suppress = (email, reason) => {
    const e = normEmail(email);
    if (e && !suppression.some(r => normEmail(r.email) === e)) {
      suppression = [...suppression, { email: e, reason, date: todayYmd }];
    }
  };
  const updateProspect = (email, business, patch) => {
    const e = normEmail(email);
    let hit = false;
    pipeline = pipeline.map(p => {
      if ((e && normEmail(p.email) === e) || (!e && business && p.business === business)) {
        hit = true;
        const next = { ...p };
        for (const [k, v] of Object.entries(patch)) if (!next[k]) next[k] = v;
        return next;
      }
      return p;
    });
    return hit;
  };

  for (const { msg, kind } of items) {
    const sent = matchSent(msg, sentLog);
    if (kind.type === 'bounce') {
      const target = kind.bouncedTo || (sent && sent.to);
      if (!target) { notes.push(`bounce with unknown recipient: "${msg.subject}"`); continue; }
      let marked = false;
      sentLog = sentLog.map(r => {
        if (!marked && normEmail(r.to) === normEmail(target) && r.status === 'sent') { marked = true; return { ...r, status: 'bounced' }; }
        return r;
      });
      suppress(target, 'bounced');
      notes.push(`bounced: ${target}`);
      continue;
    }
    if (!sent) { if (kind.type !== 'auto_reply') notes.push(`not from a prospect, ignored: ${msg.from} "${msg.subject}"`); continue; }
    if (kind.type === 'auto_reply') { notes.push(`auto-reply from ${msg.from} (follow-ups continue)`); continue; }
    if (kind.type === 'opt_out') {
      suppress(sent.to, 'opted out');
      if (normEmail(msg.from) !== normEmail(sent.to)) suppress(msg.from, 'opted out');
      // Opt-outs are recorded as lost, not as replies, so they don't inflate the reply rate.
      updateProspect(sent.to, sent.business, { unsubscribed: 'yes', lost_on: todayYmd });
      notes.push(`opted out: ${sent.business} (${sent.to})`);
      continue;
    }
    if (kind.type === 'complaint') {
      complaints.push({ email: normEmail(msg.from), date: todayYmd, subject: msg.subject });
      suppress(sent.to, 'complaint');
      updateProspect(sent.to, sent.business, { unsubscribed: 'yes', lost_on: todayYmd });
      notes.push(`COMPLAINT from ${msg.from}; mailer paused`);
      continue;
    }
    updateProspect(sent.to, sent.business, { replied_on: todayYmd });
    hotLeads.push({ business: sent.business, from: msg.from, subject: msg.subject, text: kind.text, inReplyTo: msg.messageId || '', originalSubject: sent.subject });
  }
  return { pipeline, suppression, sentLog, complaints, hotLeads, notes };
}

function randomDelayMs(range, rand = Math.random) {
  return Math.round((range.min + rand() * (range.max - range.min)) * 1000);
}

module.exports = {
  PROVIDER_PRESETS,
  DEFAULTS,
  OPT_OUT_LINE,
  MIN_DELAY_SECONDS,
  mailerSettings,
  isLocalHost,
  effectiveDelay,
  emailDomain,
  normEmail,
  buildFooter,
  withFooter,
  isSuppressed,
  checkMessage,
  localParts,
  inSendWindow,
  daysBetween,
  dailyQuota,
  breakerStatus,
  followUpBody,
  dueFollowUps,
  slug,
  stripQuoted,
  classifyInbound,
  extractBouncedRecipient,
  matchSent,
  applyInbound,
  randomDelayMs
};
