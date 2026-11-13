/**
 * HTML for a printable guided journal. Pure string builder: build.js turns the
 * result into PDF with Chromium.
 */

'use strict';

const { escapeHtml } = require('./lib');

const SIZES = Object.freeze({
  letter: Object.freeze({ label: 'US Letter', width: '8.5in', height: '11in' }),
  a4: Object.freeze({ label: 'A4', width: '210mm', height: '297mm' })
});

const DEFAULT_PALETTE = Object.freeze({ ink: '#1f2a37', accent: '#2f6f6a', paper: '#f4efe6', tint: '#e6efec', line: '#cfd4d8' });

const FONTS = Object.freeze({
  serif: "'Caladea', 'Cambria', 'Georgia', 'Liberation Serif', serif",
  sans: "'Inter', 'Liberation Sans', Arial, sans-serif",
  display: "'Inter Display', 'Inter', 'Liberation Sans', Arial, sans-serif"
});

const e = s => escapeHtml(String(s === undefined || s === null ? '' : s));

function css(p, size, f) {
  return `
  @page { size: ${size.width} ${size.height}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${f.body}; color: ${p.ink}; font-size: ${f.bodySize}; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: ${size.width}; height: ${size.height}; padding: 0.7in 0.8in 0.5in; display: flex;
    flex-direction: column; overflow: hidden; page-break-after: always; position: relative; background: #fff; }
  .eyebrow { font-family: ${FONTS.sans}; font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase;
    color: ${p.accent}; font-weight: 700; }
  h1, h2, h3 { margin: 0; font-family: ${f.heading}; font-weight: ${f.headingWeight}; letter-spacing: ${f.tracking}; }
  h2 { font-size: 25pt; line-height: 1.12; margin: 0.07in 0 0.14in; }
  p { margin: 0 0 0.11in; }
  .rule { height: 2px; width: 0.6in; background: ${p.accent}; margin: 0 0 0.16in; }
  .term { background: ${p.tint}; border-left: 3px solid ${p.accent}; padding: 0.09in 0.14in; margin: 0.03in 0 0.06in;
    font-size: 10pt; line-height: 1.4; }
  .term b { font-family: ${FONTS.sans}; }
  .prompt { font-family: ${FONTS.sans}; font-weight: 600; font-size: 10.5pt; line-height: 1.35; margin: 0.12in 0 0.02in; }
  .lines { flex: 1 1 0; min-height: 0.66in; background-image: repeating-linear-gradient(to bottom,
    transparent 0, transparent calc(0.33in - 1px), ${p.line} calc(0.33in - 1px), ${p.line} 0.33in); }
  .try { display: flex; gap: 0.12in; align-items: flex-start; border: 1.5px solid ${p.accent}; border-radius: 6px;
    padding: 0.1in 0.14in; margin-top: 0.14in; font-size: 10pt; line-height: 1.4; }
  .try i { flex: none; width: 0.17in; height: 0.17in; border: 1.5px solid ${p.accent}; border-radius: 3px; margin-top: 0.02in; }
  .try b { font-family: ${FONTS.sans}; font-size: 7.5pt; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${p.accent}; display: block; }
  .checkin { display: flex; align-items: center; flex-wrap: wrap; gap: 0.07in 0.1in; margin-top: 0.12in;
    font-family: ${FONTS.sans}; font-size: 8.5pt; }
  .checkin span.l { font-weight: 700; margin-right: 0.04in; }
  .checkin span.o { border: 1px solid ${p.ink}; border-radius: 99px; padding: 0.02in 0.1in; opacity: 0.8; }
  .footer { display: flex; justify-content: space-between; font-family: ${FONTS.sans}; font-size: 7pt;
    letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.55; padding-top: 0.14in; }
  .cover { background: ${p.paper}; padding: 0.9in 0.85in 0.7in; }
  .cover h1 { font-size: ${f.coverSize}; line-height: 1.02; margin: 0.22in 0 0.22in; max-width: 6.2in; }
  .cover .sub { font-size: 15pt; line-height: 1.35; max-width: 5.2in; }
  .cover .who { font-family: ${FONTS.sans}; font-size: 9.5pt; max-width: 4.6in; line-height: 1.45; }
  .cover .art { flex: 1; display: flex; align-items: center; min-height: 0; }
  .opener { background: ${p.tint}; }
  .opener .num { font-family: ${f.heading}; font-weight: ${f.headingWeight}; font-size: 96pt; line-height: 1;
    color: ${p.accent}; margin-top: 1.2in; }
  .opener h2 { font-size: 34pt; }
  .check { display: flex; gap: 0.14in; align-items: flex-start; margin: 0.07in 0; }
  .check i { flex: none; width: 0.16in; height: 0.16in; border: 1.4px solid ${p.accent}; border-radius: 3px; margin-top: 0.04in; }
  .box { border: 1px solid ${p.line}; border-radius: 6px; padding: 0.13in 0.17in; }
  table { width: 100%; border-collapse: collapse; flex: 1; table-layout: fixed; }
  th { font-family: ${FONTS.sans}; font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; text-align: left;
    padding: 0.06in 0.07in; border-bottom: 2px solid ${p.accent}; vertical-align: bottom; }
  td { border-bottom: 1px solid ${p.line}; border-right: 1px solid ${p.line}; padding: 0 0.07in;
    font-family: ${FONTS.sans}; font-size: 9pt; }
  td:last-child { border-right: 0; }
  .small { font-size: 9.2pt; line-height: 1.45; }
  .help b { font-family: ${FONTS.sans}; }
  .help p { margin-bottom: 0.1in; }
  `;
}

// One simple drawing per journal, made from the journal's own idea.
const MOTIFS = Object.freeze({
  // Two circles that overlap: money and mind.
  overlap: p => `<svg width="420" viewBox="0 0 420 260" role="img" aria-label="">
    <circle cx="150" cy="130" r="118" fill="${p.accent}" opacity="0.18"/>
    <circle cx="270" cy="130" r="118" fill="${p.accent}" opacity="0.18"/>
    <circle cx="150" cy="130" r="118" fill="none" stroke="${p.ink}" stroke-width="1.6"/>
    <circle cx="270" cy="130" r="118" fill="none" stroke="${p.ink}" stroke-width="1.6"/>
    <text x="92" y="136" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="3" text-anchor="middle" fill="${p.ink}">MONEY</text>
    <text x="328" y="136" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="3" text-anchor="middle" fill="${p.ink}">MIND</text>
    <text x="210" y="136" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="3" text-anchor="middle" fill="${p.accent}">YOU</text></svg>`,
  // Four steps going up: the four stages.
  steps: p => `<svg width="440" viewBox="0 0 440 250" role="img" aria-label="">
    ${[0, 1, 2, 3].map(i => `<rect x="${i * 110}" y="${190 - i * 56}" width="110" height="${60 + i * 56}" fill="${p.accent}" opacity="${0.22 + i * 0.22}"/>
      <text x="${i * 110 + 14}" y="${214 - i * 56}" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="${i > 1 ? '#fff' : p.ink}">${i + 1}</text>`).join('')}
    <line x1="0" y1="250" x2="440" y2="250" stroke="${p.ink}" stroke-width="2"/></svg>`,
  // Wavy lines that settle: rough days and calmer ones.
  waves: p => `<svg width="440" viewBox="0 0 440 240" role="img" aria-label="">
    ${[0, 1, 2, 3, 4].map(i => { const a = 34 - i * 7; const y = 30 + i * 45;
      return `<path d="M 0 ${y} C 55 ${y - a}, 55 ${y + a}, 110 ${y} S 165 ${y - a}, 220 ${y} S 275 ${y + a}, 330 ${y} S 385 ${y - a}, 440 ${y}"
        fill="none" stroke="${i === 4 ? p.ink : p.accent}" stroke-width="${i === 4 ? 2.2 : 3}" stroke-linecap="round" opacity="${i === 4 ? 1 : 0.35 + i * 0.15}"/>`; }).join('')}</svg>`
});

function worksheetTable(w) {
  const labels = w.rowLabels || Array.from({ length: w.rows }, () => '');
  const head = w.columns.map(c => `<th${c.width ? ` style="width:${e(c.width)}"` : ''}>${e(c.label)}</th>`).join('');
  const body = labels.map(l => `<tr><td>${e(l)}</td>${w.columns.slice(1).map(() => '<td></td>').join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderJournal(journal, config, sizeKey = 'letter') {
  const size = SIZES[sizeKey];
  if (!size) throw new Error(`Unknown page size: ${sizeKey}`);
  const p = { ...DEFAULT_PALETTE, ...(journal.palette || {}) };
  const sansLook = journal.look === 'sans';
  const f = sansLook
    ? { heading: FONTS.display, headingWeight: 800, tracking: '-0.02em', body: FONTS.sans, bodySize: '10.4pt', coverSize: '58pt' }
    : { heading: FONTS.serif, headingWeight: 400, tracking: '-0.005em', body: FONTS.serif, bodySize: '11.4pt', coverSize: '56pt' };
  const brand = config.brand;
  const pages = [];
  let n = 0;
  const add = (cls, body, numbered = true) => {
    n += 1;
    const foot = numbered ? `<div class="footer"><span>${e(journal.title)} &middot; ${e(brand.name)}</span><span>${n}</span></div>` : '';
    pages.push(`<section class="page ${cls}">${body}${foot}</section>`);
  };
  const paras = list => (list || []).map(t => `<p>${e(t)}</p>`).join('');
  const lined = list => (list || []).map(t => `<div class="prompt">${e(t)}</div><div class="lines"></div>`).join('');
  const checkin = c => (c ? `<div class="checkin"><span class="l">${e(c.label)}</span>${c.options.map(o => `<span class="o">${e(o)}</span>`).join('')}</div>` : '');
  const partWord = journal.partWord || 'Week';
  const motif = MOTIFS[journal.motif] || MOTIFS.overlap;

  add('cover', `<div class="eyebrow">${e(journal.label)}</div>
    <h1>${e(journal.title)}</h1><div class="sub">${e(journal.subtitle)}</div>
    <div class="art">${motif(p)}</div>
    <div class="who"><b>Made for:</b> ${e(journal.audience)}</div>
    <div class="eyebrow" style="margin-top:0.3in;color:${p.ink}">${e(brand.name)}</div>`, false);

  add('welcome', `<div class="eyebrow">Welcome</div><h2>${e(journal.introTitle || 'Before you start')}</h2>
    <div class="rule"></div>${paras(journal.intro)}<div style="flex:1"></div>`);

  add('howto', `<div class="eyebrow">How to use this journal</div><h2>${e(journal.howToTitle || 'Ten minutes a day')}</h2><div class="rule"></div>
    ${journal.howTo.map(h => `<div class="check"><i></i><div>${e(h)}</div></div>`).join('')}
    <div style="flex:1"></div>
    <div class="box small"><b>Please read this.</b> ${e(journal.careNote || config.careNote)}</div>`);

  add('begin', `<div class="eyebrow">Before day 1</div><h2>${e(journal.beginTitle || 'Where I am starting from')}</h2><div class="rule"></div>
    ${lined(journal.beginPrompts)}`);

  journal.parts.forEach((part, pi) => {
    if (part.opener) {
      add('opener', `<div class="num">${pi + 1}</div><div class="eyebrow">${e(partWord)} ${pi + 1} &middot; Days ${part.from} to ${part.to}</div>
        <h2>${e(part.title)}</h2><div class="rule"></div>
        <p><b>${e(part.opener.who)}</b></p><p>${e(part.opener.text)}</p>
        ${(part.opener.learn || []).map(h => `<div class="check"><i></i><div>${e(h)}</div></div>`).join('')}
        <div style="flex:1"></div>`);
    }
    for (const d of journal.days.filter(x => x.day >= part.from && x.day <= part.to)) {
      add('day', `<div class="eyebrow">Day ${d.day} &middot; ${e(partWord)} ${pi + 1}: ${e(part.title)}</div>
        <h2>${e(d.title)}</h2>
        <p>${e(d.read)}</p>
        ${d.term ? `<div class="term"><b>${e(d.term.word)}:</b> ${e(d.term.meaning)}</div>` : ''}
        ${lined(d.prompts)}
        <div class="try"><i></i><div><b>${e(journal.tryLabel || 'Try this today')}</b>${e(d.try)}</div></div>
        ${checkin(journal.checkin)}`);
    }
    add('pause', `<div class="eyebrow">Pause &middot; end of ${e(partWord.toLowerCase())} ${pi + 1}</div>
      <h2>${e(part.pauseTitle || 'Look back before you go on')}</h2><div class="rule"></div>
      <p>${e(part.pause || '')}</p>${lined(part.pausePrompts)}`);
    for (const w of part.worksheets || []) {
      add('sheet', `<div class="eyebrow">Worksheet</div><h2>${e(w.title)}</h2>
        <p class="small">${e(w.intro || '')}</p>${worksheetTable(w)}
        ${w.note ? `<p class="small" style="margin:0.1in 0 0">${e(w.note)}</p>` : ''}`);
    }
  });

  add('closing', `<div class="eyebrow">After the last day</div>
    <h2>${e(journal.closingTitle || 'Where I am now')}</h2><div class="rule"></div>${paras(journal.closing)}
    ${lined(journal.closingPrompts)}`);

  add('help', `<div class="eyebrow">Real help, free or low cost</div><h2>${e(journal.helpTitle || 'Where to get help')}</h2><div class="rule"></div>
    <div class="help small">${journal.help.map(h => `<p><b>${e(h.name)}.</b> ${e(h.detail)}</p>`).join('')}</div>
    <div style="flex:1"></div>
    <div class="box small">${e(config.helpNote)}</div>`);

  add('credits', `<div class="eyebrow">The small print, kept short</div><h2>About this journal</h2><div class="rule"></div>
    <div class="small">
    <p><b>What the facts are based on.</b></p>
    ${journal.sources.map(s => `<p style="margin:0 0 0.05in 0.15in">&bull; ${e(s)}</p>`).join('')}
    <p style="margin-top:0.12in"><b>What this is not.</b> ${e(journal.notAdvice || config.notAdvice)}</p>
    <p><b>How this was made.</b> ${e(config.aiDisclosure)}</p>
    <p><b>Your license.</b> This copy is for your personal use. Print it as often as you like for yourself. Please do not share the file, resell it or post it online.</p>
    <p>&copy; ${e(config.copyrightYear)} ${e(brand.name)}</p></div><div style="flex:1"></div>`);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(journal.title)}</title>
    <style>${css(p, size, f)}</style></head><body>${pages.join('\n')}</body></html>`;
  return Object.freeze({ html, pageCount: n });
}

module.exports = { SIZES, DEFAULT_PALETTE, MOTIFS, renderJournal };
