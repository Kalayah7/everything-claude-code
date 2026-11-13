/**
 * Pure functions for the life journals: the rules every journal must pass
 * before it is built. Plain data in, a list of problems out, so it can be
 * unit tested without a browser.
 */

'use strict';

const { escapeHtml } = require('../../ai-company/scripts/lib');

const READ_WORDS = Object.freeze({ min: 45, max: 115 });

/**
 * Phrases a money or mental-health journal must not use: promised results,
 * and anything that puts the journal in place of professional help.
 */
const BANNED = Object.freeze([
  [/\bguarantee[ds]?\b/i, 'promises a result'],
  [/\bget rich\b/i, 'promises a result'],
  [/\brisk[- ]free\b/i, 'promises a result'],
  [/\b(?:will|can) cure\b/i, 'promises a cure'],
  [/\binstead of (?:a |your )?(?:therap|doctor|counsel|medic)/i, 'replaces professional help'],
  [/\b(?:stop|quit) taking (?:your )?(?:medic|meds)/i, 'discourages medical care'],
  [/\bjust (?:cheer up|get over it|calm down)\b/i, 'dismisses the reader'],
  [/\[CHECK\]/, 'unchecked fact left in']
]);

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return w ? 1 : 0;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Flesch-Kincaid grade level: a rough guide to how hard the text is to read. */
function readingGrade(text) {
  const clean = String(text || '').replace(/\$?\d[\d,.]*%?/g, 'num');
  const sentences = clean.split(/[.!?]+(?:\s|$)/).filter(s => s.trim()).length || 1;
  const words = clean.split(/\s+/).filter(w => /[a-z]/i.test(w));
  if (words.length === 0) return 0;
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
  return Math.round(grade * 10) / 10;
}

function allText(journal) {
  const out = [];
  const walk = v => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(journal);
  return out;
}

/** Returns a list of problems. An empty list means the journal may be built. */
function validateJournal(journal) {
  const errors = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };

  for (const key of ['slug', 'title', 'subtitle', 'audience', 'label']) {
    need(typeof journal[key] === 'string' && journal[key].trim(), `"${key}" is missing`);
  }
  for (const key of ['intro', 'howTo', 'beginPrompts', 'closing', 'closingPrompts', 'help', 'sources']) {
    need(Array.isArray(journal[key]) && journal[key].length > 0, `"${key}" must be a list with at least one item`);
  }
  const days = Array.isArray(journal.days) ? journal.days : [];
  const parts = Array.isArray(journal.parts) ? journal.parts : [];
  need(days.length > 0, 'the journal has no days');
  need(parts.length > 0, 'the journal has no parts');

  days.forEach((d, i) => {
    const at = `day ${d.day}`;
    need(d.day === i + 1, `day ${i + 1} is numbered ${d.day}`);
    need(typeof d.title === 'string' && d.title.trim(), `${at}: no title`);
    const words = wordCount(d.read);
    need(words >= READ_WORDS.min && words <= READ_WORDS.max,
      `${at}: the reading is ${words} words (keep it ${READ_WORDS.min} to ${READ_WORDS.max})`);
    need(Array.isArray(d.prompts) && d.prompts.length === 2 && d.prompts.every(p => typeof p === 'string' && p.trim()),
      `${at}: needs exactly two prompts`);
    need(typeof d.try === 'string' && d.try.trim(), `${at}: no "try this" step`);
    if (d.term) need(d.term.word && d.term.meaning, `${at}: a key term needs a word and a meaning`);
  });

  let next = 1;
  parts.forEach(p => {
    need(typeof p.title === 'string' && p.title.trim(), 'a part has no title');
    need(p.from === next, `part "${p.title}" starts at day ${p.from}, expected ${next}`);
    need(p.to >= p.from, `part "${p.title}" ends before it starts`);
    need(Array.isArray(p.pausePrompts) && p.pausePrompts.length >= 2 && p.pausePrompts.length <= 4,
      `part "${p.title}" needs 2 to 4 pause prompts`);
    (p.worksheets || []).forEach(w => {
      need(w.title && Array.isArray(w.columns) && w.columns.length >= 2, `worksheet "${w.title}" needs a title and 2+ columns`);
      need(Array.isArray(w.rowLabels) || Number.isInteger(w.rows), `worksheet "${w.title}" needs rows or rowLabels`);
    });
    next = p.to + 1;
  });
  if (parts.length > 0) need(next === days.length + 1, `the parts cover days 1 to ${next - 1} but there are ${days.length} days`);

  for (const text of allText(journal)) {
    for (const [pattern, why] of BANNED) {
      if (pattern.test(text)) errors.push(`${why}: "${text.slice(0, 70)}${text.length > 70 ? '...' : ''}"`);
    }
  }

  if (typeof journal.maxGrade === 'number' && days.length > 0) {
    const grade = readingGrade(days.map(d => d.read).join(' '));
    need(grade <= journal.maxGrade, `the readings are at grade level ${grade}; this audience needs ${journal.maxGrade} or lower`);
    days.forEach(d => {
      const g = readingGrade(d.read);
      need(g <= journal.maxGrade + 3, `day ${d.day}: reading is at grade level ${g}; use shorter words and sentences`);
    });
  }
  return errors;
}

module.exports = { READ_WORDS, escapeHtml, wordCount, syllables, readingGrade, validateJournal };
