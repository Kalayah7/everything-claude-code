/**
 * Pure functions for the faith studio: scripture lookup, product validation,
 * channel fees, and goal math.
 *
 * Everything here works on plain data so it can be unit tested.
 * Two rules are enforced in code, not left to judgment:
 *   1. Scripture text is never typed by a person or a model. It is looked up
 *      from the public-domain World English Bible by reference.
 *   2. The goal counts VERIFIED money only (verified = yes in the sales file).
 */

'use strict';

const shared = require('../../ai-company/scripts/lib');

const { isYes, round2, toNumber, parseCsv, escapeHtml, money, progressBar } = shared;

// ---------------------------------------------------------------------------
// Scripture
// ---------------------------------------------------------------------------

const BOOK_ALIASES = Object.freeze({ psalm: 'psalms', 'song of songs': 'songofsolomon' });

/**
 * Parse "Psalm 46:10", "1 Peter 5:6-7" or "Isaiah 43:18-19".
 * Single-chapter ranges only; that is all a journal page needs.
 */
function parseRef(ref) {
  const m = /^\s*((?:[1-3]\s)?[A-Za-z][A-Za-z ]*?)\s+(\d+):(\d+)(?:\s*[-–]\s*(\d+))?\s*$/.exec(String(ref || ''));
  if (!m) throw new Error(`Cannot read scripture reference: "${ref}"`);
  const name = m[1].trim().replace(/\s+/g, ' ');
  const key = name.toLowerCase();
  const file = (BOOK_ALIASES[key] || key).replace(/\s+/g, '');
  const verseStart = Number(m[3]);
  const verseEnd = m[4] ? Number(m[4]) : verseStart;
  if (verseEnd < verseStart) throw new Error(`Verse range runs backwards: "${ref}"`);
  return Object.freeze({ book: name, file, chapter: Number(m[2]), verseStart, verseEnd });
}

/**
 * Join the text of a verse range from one book's chunks
 * (the JSON format of github.com/TehShrike/world-english-bible).
 */
function verseText(chunks, parsed) {
  const found = new Set();
  const parts = [];
  for (const c of chunks) {
    if (typeof c.value !== 'string' || c.chapterNumber !== parsed.chapter) continue;
    if (c.verseNumber < parsed.verseStart || c.verseNumber > parsed.verseEnd) continue;
    found.add(c.verseNumber);
    parts.push(c.value);
  }
  for (let v = parsed.verseStart; v <= parsed.verseEnd; v++) {
    if (!found.has(v)) {
      throw new Error(`${parsed.book} ${parsed.chapter}:${v} not found in the Bible data`);
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

/** A verse range that ends mid-sentence reads better with a clean ending. */
function tidyVerseEnding(text) {
  return text.replace(/[,;:\u2014-]\s*$/, '.');
}

/**
 * A verse lifted out of a longer speech often carries half a pair of quotation
 * marks. Close the pair, then drop marks that only wrap the whole verse.
 * Words are never changed; only quote marks, the final mark and the first capital.
 */
function balanceQuotes(text) {
  let depth = 0;
  let needsOpener = false;
  for (const ch of text) {
    if (ch === '\u201c') depth += 1;
    else if (ch === '\u201d') {
      if (depth === 0) needsOpener = true;
      else depth -= 1;
    }
  }
  let out = `${needsOpener ? '\u201c' : ''}${text}${depth > 0 ? '\u201d' : ''}`;
  const inner = out.slice(1, -1);
  if (out.startsWith('\u201c') && out.endsWith('\u201d') && !/[\u201c\u201d]/.test(inner)) out = inner;
  if (out.startsWith('\u2018') && out.endsWith('\u2019') && !out.slice(1).includes('\u2018')) out = out.slice(1, -1);
  return out;
}

function tidyVerse(text) {
  const balanced = balanceQuotes(tidyVerseEnding(text));
  return balanced.replace(/^(\u201c?)([a-z])/, (m, q, c) => q + c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Product validation
// ---------------------------------------------------------------------------

function wordCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

const LIMITS = Object.freeze({
  reflectionMinWords: 45,
  reflectionMaxWords: 105,
  promptMaxWords: 32,
  prayerMaxWords: 45,
  etsyTitleMax: 140,
  etsyTagMax: 20,
  etsyTagCount: 13
});

// Claims a faith journal must never make. Checked on every reflection, prompt and prayer.
const BANNED_CLAIMS = Object.freeze([
  /\bguarantee[sd]?\b/i,
  /\bGod will (give|grant|bring|make) you\b/i,
  /\bcure[sd]?\b/i,
  /\bheal(s|ed)? your (anxiety|depression|illness|disease)\b/i,
  /\binstead of (therapy|medication|counsel)/i,
  /\bif you (just )?(have|had) enough faith\b/i
]);

function validateProduct(product) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(/^[a-z0-9-]+$/.test(product.slug || ''), 'slug must be lowercase letters, digits and dashes');
  need(product.title, 'title is required');
  need(product.subtitle, 'subtitle is required');
  need(Array.isArray(product.intro) && product.intro.length > 0, 'intro paragraphs are required');
  need(Array.isArray(product.days) && product.days.length >= 7, 'at least 7 days are required');

  const refs = new Set();
  (product.days || []).forEach((d, i) => {
    const label = `day ${i + 1}`;
    need(d.day === i + 1, `${label}: "day" must be ${i + 1}`);
    need(d.title, `${label}: title is required`);
    try {
      parseRef(d.ref);
    } catch (err) {
      errors.push(`${label}: ${err.message}`);
    }
    need(!refs.has(d.ref), `${label}: ${d.ref} is used twice`);
    refs.add(d.ref);
    need(!('text' in d) && !('verse' in d), `${label}: do not type verse text; it is looked up from the reference`);
    const words = wordCount(d.reflection);
    need(words >= LIMITS.reflectionMinWords && words <= LIMITS.reflectionMaxWords,
      `${label}: reflection is ${words} words (keep ${LIMITS.reflectionMinWords}-${LIMITS.reflectionMaxWords} so the page fits)`);
    need(Array.isArray(d.prompts) && d.prompts.length === 2, `${label}: exactly 2 prompts are required`);
    (d.prompts || []).forEach((p, j) =>
      need(wordCount(p) <= LIMITS.promptMaxWords, `${label}: prompt ${j + 1} is too long`));
    need(d.prayer && wordCount(d.prayer) <= LIMITS.prayerMaxWords, `${label}: prayer is required (max ${LIMITS.prayerMaxWords} words)`);
    const all = [d.reflection, ...(d.prompts || []), d.prayer].join(' ');
    for (const pattern of BANNED_CLAIMS) {
      need(!pattern.test(all), `${label}: contains a claim we never make (${pattern})`);
    }
    need(!/[“"][^”"]{60,}[”"]/.test(d.reflection || ''),
      `${label}: reflection has a long quotation; paraphrase instead so no scripture is typed by hand`);
  });

  const weeks = product.weeks || [];
  let next = 1;
  weeks.forEach((w, i) => {
    need(w.title && w.from === next && w.to >= w.from, `week ${i + 1}: needs a title and must start on day ${next}`);
    next = w.to + 1;
  });
  need(product.pausePrompts === undefined || (Array.isArray(product.pausePrompts) && product.pausePrompts.length === 4),
    'pausePrompts, when given, must be exactly 4');
  need(weeks.length === 0 || next === (product.days || []).length + 1, 'weeks must cover every day exactly once');

  return errors;
}

function validateListing(listing) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(listing.etsyTitle && listing.etsyTitle.length <= LIMITS.etsyTitleMax,
    `etsyTitle is required (max ${LIMITS.etsyTitleMax} characters)`);
  const tags = listing.etsyTags || [];
  need(tags.length === LIMITS.etsyTagCount, `exactly ${LIMITS.etsyTagCount} Etsy tags are required (found ${tags.length})`);
  tags.forEach(t => need(t.length <= LIMITS.etsyTagMax, `tag "${t}" is over ${LIMITS.etsyTagMax} characters`));
  need(new Set(tags.map(t => t.toLowerCase())).size === tags.length, 'Etsy tags must be unique');
  need(listing.description && listing.description.length >= 300, 'description is required (300+ characters)');
  need(/AI/.test(listing.disclosure || ''), 'disclosure must say plainly how AI was used');
  need(Array.isArray(listing.pins) && listing.pins.length >= 3, 'at least 3 pins are required');
  return errors;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

function estimateChannelFee(gross, channel) {
  if (gross <= 0 || !channel) return 0;
  return round2(gross * channel.feePercent + channel.feeFixed);
}

function inMonth(dateStr, month) {
  return String(dateStr || '').startsWith(month);
}

/**
 * Summarize one calendar month (YYYY-MM).
 * Sales columns: date, channel, offer, product, units, gross, fees, refunds, verified, note
 *   - one row per order, or one weekly roll-up row per channel and offer
 *   - fees may be blank; they are then estimated per unit from the channel in config
 * Expense columns: date, vendor, description, amount
 */
function summarizeMonth(salesRows, expenseRows, month, config) {
  const rows = salesRows.filter(r => inMonth(r.date, month));
  const verified = rows.filter(r => isYes(r.verified));
  const unverified = rows.filter(r => !isYes(r.verified));

  const units = r => Math.max(1, toNumber(r.units) || 1);
  const rowFees = r => {
    if (r.fees !== undefined && r.fees !== '') return toNumber(r.fees);
    const n = units(r);
    return round2(estimateChannelFee(toNumber(r.gross) / n, config.channels[r.channel]) * n);
  };

  const gross = round2(verified.reduce((s, r) => s + toNumber(r.gross), 0));
  const refunds = round2(verified.reduce((s, r) => s + toNumber(r.refunds), 0));
  const fees = round2(verified.reduce((s, r) => s + rowFees(r), 0));
  const orders = verified.reduce((s, r) => s + units(r), 0);
  const expenses = round2(
    expenseRows.filter(r => inMonth(r.date, month)).reduce((s, r) => s + toNumber(r.amount), 0)
  );
  const net = round2(gross - refunds - fees - expenses);
  const target = config.goal.monthlyNetTarget;

  const byChannel = {};
  for (const r of verified) {
    const key = r.channel || 'unknown';
    const prev = byChannel[key] || { orders: 0, gross: 0 };
    byChannel[key] = { orders: prev.orders + units(r), gross: round2(prev.gross + toNumber(r.gross)) };
  }

  return Object.freeze({
    month, gross, refunds, fees, expenses, net, target, orders,
    byChannel: Object.freeze(byChannel),
    netPerOrder: orders > 0 ? round2((gross - refunds - fees) / orders) : 0,
    gap: round2(Math.max(0, target - net)),
    progress: target > 0 ? Math.max(0, net) / target : 0,
    goalMet: net >= target,
    unverifiedCount: unverified.length,
    unverifiedGross: round2(unverified.reduce((s, r) => s + Math.max(0, toNumber(r.gross)), 0)),
    taxReserve: round2(Math.max(0, net) * (config.taxReserveRate || 0))
  });
}

/** Expected net per order from the assumed mix of offers and channels in config. */
function assumedNetPerOrder(config) {
  const a = config.assumptions;
  let net = 0;
  for (const [offerId, share] of Object.entries(a.offerMix)) {
    const offer = config.offers.find(o => o.id === offerId);
    if (!offer) throw new Error(`assumptions.offerMix names an unknown offer: ${offerId}`);
    for (const [channelId, channelShare] of Object.entries(a.channelMix)) {
      const channel = config.channels[channelId];
      if (!channel) throw new Error(`assumptions.channelMix names an unknown channel: ${channelId}`);
      net += share * channelShare * (offer.price - estimateChannelFee(offer.price, channel));
    }
  }
  return round2(net);
}

/**
 * Orders and visits needed to close the gap.
 * Uses real net-per-order and conversion once enough real data exists.
 */
function planToGoal(config, summary, traffic) {
  const a = config.assumptions;
  const realOrders = summary.orders >= a.minOrdersForRealRates;
  const netPerOrder = realOrders ? summary.netPerOrder : assumedNetPerOrder(config);
  const visits = traffic ? traffic.visits : 0;
  const realConversion = visits >= a.minVisitsForRealRates && summary.orders > 0;
  const conversion = realConversion ? summary.orders / visits : a.conversionRate;
  const ordersNeeded = netPerOrder > 0 ? Math.ceil(summary.gap / netPerOrder) : Infinity;
  const totalOrders = netPerOrder > 0 ? Math.ceil(summary.target / netPerOrder) : Infinity;
  return Object.freeze({
    netPerOrder,
    netPerOrderIsReal: realOrders,
    conversion,
    conversionIsReal: realConversion,
    ordersNeeded,
    ordersPerDayAtGoal: round2(totalOrders / 30),
    visitsNeededAtGoal: conversion > 0 ? Math.ceil(totalOrders / conversion) : Infinity,
    totalOrdersAtGoal: totalOrders
  });
}

function sumVisits(trafficRows, month) {
  const visits = trafficRows.filter(r => inMonth(r.date, month)).reduce((s, r) => s + toNumber(r.visits), 0);
  return Object.freeze({ visits });
}

function csvCell(value) {
  const s = String(value === undefined || value === null ? '' : value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header, rows) {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

module.exports = {
  isYes, round2, toNumber, parseCsv, escapeHtml, money, progressBar,
  LIMITS,
  parseRef,
  verseText,
  tidyVerseEnding,
  balanceQuotes,
  tidyVerse,
  wordCount,
  validateProduct,
  validateListing,
  estimateChannelFee,
  summarizeMonth,
  assumedNetPerOrder,
  planToGoal,
  sumVisits,
  toCsv
};
