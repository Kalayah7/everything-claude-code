/**
 * HTML for the printable journal, the listing images, and the Pinterest pins.
 * Pure string builders: the CLI turns them into PDF and PNG with Chromium.
 */

'use strict';

const { escapeHtml } = require('./lib');

const SIZES = Object.freeze({
  letter: Object.freeze({ label: 'US Letter', width: '8.5in', height: '11in' }),
  a4: Object.freeze({ label: 'A4', width: '210mm', height: '297mm' })
});

const DEFAULT_PALETTE = Object.freeze({ ink: '#2e3530', accent: '#7c8f6c', paper: '#f5f0e6', line: '#cfc9bc', backdrop: '#dde3d3' });

const e = s => escapeHtml(String(s === undefined || s === null ? '' : s));

function baseCss(palette, size) {
  return `
  @page { size: ${size.width} ${size.height}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Caladea', 'Cambria', 'Charter', 'Georgia', 'Liberation Serif', serif; color: ${palette.ink};
    font-size: 11.5pt; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: ${size.width}; height: ${size.height}; padding: 0.7in 0.8in 0.55in; display: flex;
    flex-direction: column; overflow: hidden; page-break-after: always; position: relative; background: #fff; }
  .sans { font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; }
  .eyebrow { font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; font-size: 8pt; letter-spacing: 0.22em;
    text-transform: uppercase; color: ${palette.accent}; font-weight: 600; }
  h1, h2, h3 { font-weight: normal; margin: 0; }
  h2 { font-size: 25pt; line-height: 1.15; margin: 0.08in 0 0.16in; }
  p { margin: 0 0 0.12in; }
  .rule { height: 1px; background: ${palette.accent}; opacity: 0.55; margin: 0.12in 0; }
  .verse { font-style: italic; font-size: 13pt; line-height: 1.45; padding: 0.02in 0 0.02in 0.18in;
    border-left: 2.5px solid ${palette.accent}; margin: 0.04in 0 0.05in; }
  .ref { font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; font-size: 8.5pt; letter-spacing: 0.08em;
    text-transform: uppercase; margin: 0 0 0.16in 0.2in; color: ${palette.ink}; opacity: 0.75; }
  .prompt { font-weight: bold; font-size: 11pt; margin: 0.12in 0 0.02in; }
  .lines { flex: 1 1 0; min-height: 0.6in; background-image: repeating-linear-gradient(to bottom,
    transparent 0, transparent calc(0.33in - 1px), ${palette.line} calc(0.33in - 1px), ${palette.line} 0.33in); }
  .prayer { font-style: italic; margin: 0.14in 0 0.02in; }
  .prayer b { font-style: normal; font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; font-size: 8pt;
    letter-spacing: 0.2em; text-transform: uppercase; color: ${palette.accent}; margin-right: 0.08in; }
  .footer { display: flex; justify-content: space-between; font-family: 'Inter', 'Liberation Sans', Arial, sans-serif;
    font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.55; padding-top: 0.14in; }
  .cover { background: ${palette.paper}; padding: 0.6in; }
  .cover .frame { flex: 1; border: 1.5px solid ${palette.accent}; padding: 0.7in 0.6in; display: flex;
    flex-direction: column; align-items: center; text-align: center; }
  .cover h1 { font-size: 50pt; line-height: 1.05; margin: 0.25in 0 0.2in; }
  .cover .sub { font-size: 15pt; font-style: italic; max-width: 4.8in; }
  .cover svg { margin-top: auto; }
  .cover .brand { margin-top: 0.4in; }
  .check { display: flex; gap: 0.14in; align-items: flex-start; margin: 0.07in 0; }
  .check i { flex: none; width: 0.17in; height: 0.17in; border: 1.2px solid ${palette.ink}; margin-top: 0.03in; }
  table { width: 100%; border-collapse: collapse; flex: 1; }
  th { font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; font-size: 8pt; letter-spacing: 0.16em;
    text-transform: uppercase; text-align: left; padding: 0.06in 0.08in; border-bottom: 1.5px solid ${palette.accent}; }
  td { border-bottom: 1px solid ${palette.line}; border-right: 1px solid ${palette.line}; }
  td:last-child { border-right: 0; }
  .small { font-size: 9.5pt; line-height: 1.45; }
  `;
}

function horizonSvg(palette, width = 260) {
  const arcs = [100, 76, 52, 28].map(r =>
    `<path d="M ${130 - r} 110 A ${r} ${r} 0 0 1 ${130 + r} 110" fill="none" stroke="${palette.accent}" stroke-width="1.6"/>`
  ).join('');
  return `<svg width="${width}" viewBox="0 0 260 122" role="img" aria-label="">${arcs}` +
    `<line x1="6" y1="110" x2="254" y2="110" stroke="${palette.ink}" stroke-width="1.6"/></svg>`;
}

function footer(product, brand, n) {
  return `<div class="footer"><span>${e(product.title)} &middot; ${e(brand.name)}</span><span>${n}</span></div>`;
}

function weekFor(product, day) {
  return (product.weeks || []).find(w => day >= w.from && day <= w.to);
}

/**
 * Build the whole journal as one HTML document.
 * `verses` maps each day's ref to its looked-up text.
 */
function renderJournal(product, verses, config, sizeKey = 'letter') {
  const size = SIZES[sizeKey];
  if (!size) throw new Error(`Unknown page size: ${sizeKey}`);
  const palette = { ...DEFAULT_PALETTE, ...(product.palette || {}) };
  const brand = config.brand;
  const pages = [];
  let n = 0;
  const add = (cls, body, numbered = true) => {
    n += 1;
    pages.push(`<section class="page ${cls}">${body}${numbered ? footer(product, brand, n) : ''}</section>`);
  };
  const paras = list => (list || []).map(p => `<p>${e(p)}</p>`).join('');

  add('cover', `<div class="frame"><div class="eyebrow">Guided prayer journal</div>
    <h1>${e(product.title)}</h1><div class="sub">${e(product.subtitle)}</div>
    ${horizonSvg(palette, 330)}<div class="eyebrow brand">${e(brand.name)}</div></div>`, false);

  add('welcome', `<div class="eyebrow">Welcome</div><h2>${e(product.introTitle || 'Before anything else')}</h2>
    <div class="rule"></div>${paras(product.intro)}<div style="flex:1"></div>`);

  add('howto', `<div class="eyebrow">How to use this journal</div><h2>Ten quiet minutes a day</h2><div class="rule"></div>
    ${(product.howTo || []).map(h => `<div class="check"><i></i><div>${e(h)}</div></div>`).join('')}
    <div style="flex:1"></div>
    <div class="small" style="border:1px solid ${palette.line};padding:0.14in 0.18in;">
    <b>A note of care.</b> ${e(config.careNote)}</div>`);

  add('begin', `<div class="eyebrow">Before you begin</div><h2>Name the season</h2><div class="rule"></div>
    ${(product.beginPrompts || []).map(p => `<div class="prompt">${e(p)}</div><div class="lines"></div>`).join('')}`);

  for (const d of product.days) {
    const week = weekFor(product, d.day);
    add('day', `<div class="eyebrow">Day ${d.day}${week ? ` &middot; ${e(week.title)}` : ''}</div>
      <h2>${e(d.title)}</h2>
      <div class="verse">${e(verses[d.ref])}</div>
      <div class="ref">${e(d.ref)} &middot; ${e(config.scripture.abbreviation)}</div>
      <p>${e(d.reflection)}</p>
      <div class="prompt">${e(d.prompts[0])}</div><div class="lines"></div>
      <div class="prompt">${e(d.prompts[1])}</div><div class="lines"></div>
      <div class="prayer"><b>Pray</b>${e(d.prayer)}</div><div class="lines" style="flex:0.45 1 0;min-height:0.33in"></div>`);

    if (week && week.to === d.day) {
      add('pause', `<div class="eyebrow">Weekly pause &middot; ${e(week.title)}</div>
        <h2>${e(week.pauseTitle || 'Look back before you go on')}</h2><div class="rule"></div>
        <p>${e(week.pause || '')}</p>
        <div class="prompt">One thing I noticed about God this week</div><div class="lines"></div>
        <div class="prompt">One thing I noticed about myself</div><div class="lines"></div>
        <div class="prompt">What I am still waiting on, said plainly</div><div class="lines"></div>
        <div class="prompt">Someone I can tell about this week</div><div class="lines" style="flex:0.4 1 0"></div>`);
    }
  }

  add('closing', `<div class="eyebrow">Day ${product.days.length + 1} and after</div>
    <h2>${e(product.closingTitle || 'Where you are now')}</h2><div class="rule"></div>${paras(product.closing)}
    ${(product.closingPrompts || []).map(p => `<div class="prompt">${e(p)}</div><div class="lines"></div>`).join('')}`);

  const rows = Array.from({ length: 14 }, () => '<tr><td style="width:16%"></td><td style="width:42%"></td><td></td></tr>').join('');
  for (let i = 0; i < 2; i++) {
    add('list', `<div class="eyebrow">Prayer list</div><h2>Asked and answered</h2>
      <table><thead><tr><th>Date</th><th>What I asked</th><th>What happened</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  add('credits', `<div class="eyebrow">Thank you</div><h2>The small print, kept short</h2><div class="rule"></div>
    <div class="small">
    <p><b>Your license.</b> This copy is for your personal use. Print it as many times as you like for yourself.
    Please do not share the file, resell it, or post it online. Leading a small group, class or care ministry?
    A group license covers printing for everyone: ${e(brand.storeUrl || 'see the shop listing')}.</p>
    <p><b>Scripture.</b> ${e(config.scripture.credit)}</p>
    <p><b>How this was made.</b> ${e(config.aiDisclosure)}</p>
    <p><b>A note of care.</b> ${e(config.careNote)}</p>
    <p>&copy; ${e(config.copyrightYear)} ${e(brand.name)}. ${e(brand.contactEmail || '')}</p></div>
    <div style="flex:1"></div><div style="text-align:center">${horizonSvg(palette, 150)}</div>`);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(product.title)}</title>
    <style>${baseCss(palette, size)}</style></head><body>${pages.join('\n')}</body></html>`;
  return Object.freeze({ html, pageCount: n });
}

// ---------------------------------------------------------------------------
// Listing images (2000 x 1500) and pins (1000 x 1500)
// ---------------------------------------------------------------------------

function imageCss(palette, w, h) {
  return `*{box-sizing:border-box}html,body{margin:0}
  body{width:${w}px;height:${h}px;background:${palette.backdrop};color:${palette.ink};overflow:hidden;
    font-family:'Caladea', 'Cambria', 'Charter', 'Georgia', 'Liberation Serif', serif;display:flex}
  .sans{font-family:'Inter','Liberation Sans',Arial,sans-serif}
  .eyebrow{font-family:'Inter','Liberation Sans',Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;
    color:${palette.accent};font-weight:600}
  img.sheet{background:#fff;box-shadow:0 18px 50px rgba(40,40,30,.22);display:block}`;
}

function doc(css, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}

/** shots: data URIs of page images { cover, pages: [..3] } */
function renderListingImages(product, listing, config, shots, pageCount) {
  const palette = { ...DEFAULT_PALETTE, ...(product.palette || {}) };
  const css = imageCss(palette, 2000, 1500);
  const facts = [`${product.days.length} daily pages`, `${pageCount} pages in all`, 'US Letter + A4 PDFs', 'Instant download'];

  const hero = doc(css, `<div style="flex:0 0 1010px;display:flex;align-items:center;justify-content:center">
      <img class="sheet" src="${shots.cover}" style="height:1120px;transform:rotate(-2.5deg)"></div>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;padding:0 110px 0 30px">
      <div class="eyebrow" style="font-size:30px">Printable prayer journal</div>
      <div style="font-size:112px;line-height:1.04;margin:34px 0 30px">${e(product.title)}</div>
      <div style="font-size:48px;font-style:italic;line-height:1.3">${e(product.subtitle)}</div>
      <div style="height:2px;background:${palette.accent};margin:54px 0;width:200px"></div>
      ${facts.map(f => `<div class="sans" style="font-size:36px;margin:9px 0">${e(f)}</div>`).join('')}
    </div>`);

  const inside = doc(css, `<div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:150px 0 0">
      <div class="eyebrow" style="font-size:30px">A look inside</div>
      <div style="font-size:76px;margin:22px 0 90px">${e(listing.insideHeadline)}</div>
      <div style="display:flex;gap:40px;justify-content:center">
        ${shots.pages.map(src => `<img class="sheet" src="${src}" style="height:810px">`).join('')}
      </div></div>`);

  const included = doc(css, `<div style="flex:1;padding:120px 150px;display:flex;flex-direction:column">
      <div class="eyebrow" style="font-size:30px">What you get</div>
      <div style="font-size:84px;margin:22px 0 50px">Everything in the download</div>
      ${listing.included.map(i => `<div style="display:flex;gap:34px;align-items:baseline;margin:15px 0">
        <div style="width:22px;height:22px;border:3px solid ${palette.accent};flex:none"></div>
        <div style="font-size:44px;line-height:1.3">${e(i)}</div></div>`).join('')}
      <div style="flex:1"></div>
      <div class="sans" style="font-size:30px;line-height:1.5;opacity:.8">${e(listing.imageFootnote)}</div>
    </div>`);

  return Object.freeze({ 'listing-1-cover': hero, 'listing-2-inside': inside, 'listing-3-included': included });
}

function renderPin(product, pin, config, coverShot) {
  const palette = { ...DEFAULT_PALETTE, ...(product.palette || {}) };
  return doc(imageCss(palette, 1000, 1500), `<div style="flex:1;display:flex;flex-direction:column;align-items:center;
      text-align:center;padding:96px 80px 64px">
      <div class="eyebrow" style="font-size:24px">${e(pin.eyebrow || 'Printable prayer journal')}</div>
      <div style="font-size:${pin.headline.length > 44 ? 68 : 82}px;line-height:1.1;margin:30px 0 22px">${e(pin.headline)}</div>
      <div style="font-size:35px;font-style:italic;line-height:1.3;max-width:760px">${e(pin.sub)}</div>
      <div style="flex:1;display:flex;align-items:center;min-height:0;margin:36px 0 30px">
        <img class="sheet" src="${coverShot}" style="height:690px;transform:rotate(2deg)"></div>
      <div class="eyebrow" style="font-size:22px;color:${palette.ink}">${e(config.brand.name)}</div>
    </div>`);
}

module.exports = { SIZES, DEFAULT_PALETTE, renderJournal, renderListingImages, renderPin };
