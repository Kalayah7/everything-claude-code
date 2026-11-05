/**
 * Pure functions for the AI company's money and funnel math.
 *
 * Everything here works on plain data so it can be unit tested.
 * The goal is measured in VERIFIED money only: a ledger row counts
 * only when a human has confirmed it arrived (verified = yes).
 */

'use strict';

const YES = new Set(['yes', 'y', 'true', '1']);

function isYes(value) {
  return YES.has(String(value || '').trim().toLowerCase());
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toNumber(value) {
  if (value === undefined || value === null) return 0;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  if (cleaned === '') return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) {
    throw new Error(`Not a number: "${value}"`);
  }
  return n;
}

/**
 * Minimal CSV parser: handles quoted fields, escaped quotes ("")
 * and commas/newlines inside quotes. Returns an array of objects
 * keyed by the header row. Blank lines are skipped.
 */
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const src = String(text || '').replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row = [...row, field];
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      rows.push([...row, field]);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    rows.push([...row, field]);
  }

  const nonBlank = rows.filter(r => r.some(cell => cell.trim() !== ''));
  if (nonBlank.length === 0) return [];
  const header = nonBlank[0].map(h => h.trim());
  return nonBlank.slice(1).map(cells =>
    Object.freeze(Object.fromEntries(header.map((h, idx) => [h, (cells[idx] || '').trim()])))
  );
}

function csvCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows back to CSV with a fixed header order (unknown keys are dropped). */
function toCsv(header, rows) {
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) lines.push(header.map(h => csvCell(r[h])).join(','));
  return lines.join('\n') + '\n';
}

function csvHeader(text) {
  const first = String(text || '').replace(/^﻿/, '').split(/\r?\n/)[0] || '';
  return first ? first.split(',').map(h => h.trim().replace(/^"|"$/g, '')) : [];
}

function estimateFee(gross, fees) {
  if (gross <= 0) return 0;
  return round2(gross * fees.percent + fees.fixed);
}

function inMonth(dateStr, month) {
  return String(dateStr || '').startsWith(month);
}

function findOffer(config, offerId) {
  return config.offers.find(o => o.id === offerId);
}

function netPerSale(offer, fees) {
  return round2(offer.price - estimateFee(offer.price, fees));
}

/**
 * Summarize one calendar month (YYYY-MM).
 * Ledger columns: date, client, offer_id, description, gross, fee, verified
 *   - gross is positive for payments, negative for refunds
 *   - fee may be blank; it is then estimated from config.fees
 * Expense columns: date, vendor, description, amount
 */
function summarizeMonth(ledgerRows, expenseRows, month, config) {
  const monthRows = ledgerRows.filter(r => inMonth(r.date, month));
  const verified = monthRows.filter(r => isYes(r.verified));
  const unverified = monthRows.filter(r => !isYes(r.verified));

  const payments = verified.filter(r => toNumber(r.gross) > 0);
  const refunds = verified.filter(r => toNumber(r.gross) < 0);

  const gross = round2(payments.reduce((s, r) => s + toNumber(r.gross), 0));
  const refundTotal = round2(-refunds.reduce((s, r) => s + toNumber(r.gross), 0));
  const fees = round2(verified.reduce((s, r) => {
    const g = toNumber(r.gross);
    const f = r.fee === undefined || r.fee === '' ? estimateFee(g, config.fees) : toNumber(r.fee);
    return s + f;
  }, 0));
  const expenses = round2(
    expenseRows.filter(r => inMonth(r.date, month)).reduce((s, r) => s + toNumber(r.amount), 0)
  );
  const net = round2(gross - refundTotal - fees - expenses);
  const target = config.goal.monthlyNetTarget;

  return Object.freeze({
    month,
    gross,
    refunds: refundTotal,
    fees,
    expenses,
    net,
    target,
    gap: round2(Math.max(0, target - net)),
    progress: target > 0 ? Math.max(0, net) / target : 0,
    goalMet: net >= target,
    verifiedCount: verified.length,
    unverifiedCount: unverified.length,
    unverifiedGross: round2(unverified.reduce((s, r) => s + Math.max(0, toNumber(r.gross)), 0)),
    taxReserve: round2(Math.max(0, net) * (config.taxReserveRate || 0))
  });
}

/**
 * Committed monthly recurring revenue from clients.csv.
 * Columns: client, offer_id, monthly_price, start_date, status, cancel_date, notes
 * A client is active when status is "active".
 */
function computeMrr(clientRows, config) {
  const active = clientRows.filter(r => String(r.status).toLowerCase() === 'active');
  const prices = active.map(r => {
    if (r.monthly_price !== undefined && r.monthly_price !== '') return toNumber(r.monthly_price);
    const offer = findOffer(config, r.offer_id);
    return offer ? offer.price : 0;
  });
  const gross = round2(prices.reduce((s, p) => s + p, 0));
  const net = round2(prices.reduce((s, p) => s + p - estimateFee(p, config.fees), 0));
  return Object.freeze({ activeClients: active.length, gross, net });
}

/**
 * How many more recurring clients are needed to close a net monthly gap.
 */
function clientsNeeded(gap, config) {
  if (gap <= 0) return 0;
  const offer = findOffer(config, config.primaryRecurringOffer);
  if (!offer) throw new Error(`primaryRecurringOffer "${config.primaryRecurringOffer}" not in offers`);
  const perClient = netPerSale(offer, config.fees);
  if (perClient <= 0) throw new Error('Recurring offer nets nothing after fees');
  return Math.ceil(gap / perClient);
}

/**
 * Funnel rates. Uses real rates from pipeline.csv once enough contacts
 * exist; otherwise falls back to the assumptions in config.
 * Pipeline columns used: contacted_on, replied_on, call_on, won_on
 */
function funnelRates(pipelineRows, config) {
  const a = config.funnelAssumptions;
  const contacted = pipelineRows.filter(r => r.contacted_on);
  const replied = contacted.filter(r => r.replied_on);
  const calls = replied.filter(r => r.call_on);
  const won = calls.filter(r => r.won_on);
  const enough = contacted.length >= (a.minContactsForRealRates || 50);

  const rate = (num, den, fallback) => (enough && den > 0 ? num / den : fallback);
  const replyRate = rate(replied.length, contacted.length, a.replyRate);
  const callRate = rate(calls.length, replied.length, a.callRate);
  const closeRate = rate(won.length, calls.length, a.closeRate);

  return Object.freeze({
    source: enough ? 'pipeline' : 'assumptions',
    counts: Object.freeze({
      contacted: contacted.length,
      replied: replied.length,
      calls: calls.length,
      won: won.length
    }),
    replyRate,
    callRate,
    closeRate,
    contactToClient: replyRate * callRate * closeRate
  });
}

function outreachNeeded(clients, rates) {
  if (clients <= 0) return 0;
  if (rates.contactToClient <= 0) return Infinity;
  return Math.ceil(clients / rates.contactToClient);
}

/**
 * Fill {{PLACEHOLDER}} tokens in the landing page from config.
 * Returns the html and the list of tokens that are still empty, so the
 * site is never published with dead payment buttons by accident.
 */
function renderSite(html, config) {
  const offerValue = (id, key) => {
    const offer = findOffer(config, id);
    return offer ? offer[key] : '';
  };
  const values = {
    COMPANY_NAME: config.company.name,
    TAGLINE: config.company.tagline,
    CONTACT_EMAIL: config.company.contactEmail,
    PHONE: config.company.phone,
    POSTAL_ADDRESS: config.company.postalAddress,
    SERVICE_AREA: config.company.serviceArea,
    INTAKE_FORM_URL: config.company.intakeFormUrl,
    BOOKING_URL: config.company.bookingUrl,
    AUTOPILOT_PRICE: offerValue('autopilot', 'price'),
    AUTOPILOT_LINK: offerValue('autopilot', 'paymentLink'),
    WEBSITE_PRICE: offerValue('website', 'price'),
    WEBSITE_LINK: offerValue('website', 'paymentLink'),
    YEAR: String(new Date().getFullYear())
  };

  const missing = new Set();
  const out = html.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in values)) {
      missing.add(key);
      return match;
    }
    const v = values[key];
    if (v === undefined || v === null || String(v).trim() === '') {
      missing.add(key);
      return match;
    }
    return escapeHtml(String(v));
  });
  return Object.freeze({ html: out, missing: [...missing].sort() });
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function progressBar(fraction, width = 20) {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}]`;
}

module.exports = {
  isYes,
  round2,
  toNumber,
  parseCsv,
  toCsv,
  csvHeader,
  estimateFee,
  netPerSale,
  summarizeMonth,
  computeMrr,
  clientsNeeded,
  funnelRates,
  outreachNeeded,
  renderSite,
  escapeHtml,
  money,
  progressBar
};
