/**
 * Typographic covers for KDP, built with Chromium.
 *
 *   node scripts/cover.js <slug>
 *
 * Writes to books/<slug>/dist/:
 *   <slug>-ebook-cover.jpg       1600 x 2560 px (KDP's recommended 1:1.6 ratio)
 *   <slug>-paperback-cover.pdf   full wrap: back + spine + front, 0.125 in bleed, 6 x 9 trim
 *
 * The spine width comes from the interior page count (white paper: 0.002252 in per page), so build
 * the interior first. KDP allows spine text only above 79 pages; below that the spine stays blank.
 * The back cover keeps a 2 x 1.2 in white box clear for the barcode KDP prints.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PER_PAGE_IN = 0.002252;
const BLEED = 0.125;
const e = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function spineWidth(pages) {
  return Math.round(pages * PER_PAGE_IN * 10000) / 10000;
}

function pageCount(pdf) {
  const out = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
  const m = /Pages:\s+(\d+)/.exec(out);
  if (!m) throw new Error(`cannot read page count of ${pdf}`);
  return Number(m[1]);
}

/** Front cover art: a horizon and a low sun, drawn as lines so it prints cleanly. */
function motif(p) {
  return `<svg viewBox="0 0 200 120" width="62%" aria-hidden="true">
    <circle cx="100" cy="78" r="30" fill="none" stroke="${p.accent}" stroke-width="1.6"/>
    <line x1="10" y1="78" x2="190" y2="78" stroke="${p.ink}" stroke-width="1.6"/>
    <line x1="40" y1="92" x2="160" y2="92" stroke="${p.accent}" stroke-width="1" opacity="0.7"/>
    <line x1="70" y1="104" x2="130" y2="104" stroke="${p.accent}" stroke-width="1" opacity="0.5"/>
  </svg>`;
}

function frontHtml(book, author, p, unit) {
  return `<div class="front" style="background:${p.paper};color:${p.ink}">
    <div class="series" style="color:${p.accent}">${e(book.series)} &middot; Book ${book.seriesNumber}</div>
    <h1>${e(book.title)}</h1>
    <div class="sub">${e(book.subtitle)}</div>
    <div class="art">${motif(p)}</div>
    <div class="author">${e(author)}</div>
  </div>`.replace(/UNIT/g, unit);
}

const FONT = "'Caladea', 'Charter', 'Georgia', 'Liberation Serif', serif";
const SANS = "'Inter', 'Liberation Sans', Arial, sans-serif";

function frontCss(scale) {
  // scale: CSS length for 1 "cover unit" (1/6 of the front width)
  return `
  .front { position:absolute; display:flex; flex-direction:column; align-items:center; text-align:center;
    box-sizing:border-box; font-family:${FONT}; }
  .front .series { font-family:${SANS}; letter-spacing:0.25em; text-transform:uppercase; font-weight:600;
    font-size:calc(${scale} * 0.12); margin-top:calc(${scale} * 0.9); }
  .front h1 { font-weight:normal; font-size:calc(${scale} * 0.68); line-height:1.05; margin:calc(${scale} * 0.45) calc(${scale} * 0.4) 0; }
  .front .sub { font-style:italic; font-size:calc(${scale} * 0.22); margin:calc(${scale} * 0.22) calc(${scale} * 0.6) 0; line-height:1.3; }
  .front .art { flex:1; display:flex; align-items:center; justify-content:center; width:100%; }
  .front .author { font-family:${SANS}; letter-spacing:0.22em; text-transform:uppercase; font-size:calc(${scale} * 0.15);
    margin-bottom:calc(${scale} * 0.85); }`;
}

async function render(html, fn) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await fn(page, html);
  } finally {
    await browser.close();
  }
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.log('Usage: node scripts/cover.js <slug>');
    process.exit(2);
  }
  const dir = path.join(ROOT, 'books', slug);
  const dist = path.join(dir, 'dist');
  const book = JSON.parse(fs.readFileSync(path.join(dir, 'book.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'press.config.json'), 'utf8'));
  const author = config.imprint.penName || 'Author Name';
  if (!config.imprint.penName) console.log('WARN  pen name not set: covers say "Author Name"');
  const p = book.palette;
  const interior = path.join(dist, `${slug}-interior-6x9.pdf`);
  if (!fs.existsSync(interior)) throw new Error(`build the interior first: node scripts/press.js build ${slug}`);
  const pages = pageCount(interior);

  // eBook cover: 1600 x 2560 px
  const ebook = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1600px;height:2560px;} ${frontCss('266.67px')}
    .front{left:0;top:0;width:1600px;height:2560px;}</style></head><body>${frontHtml(book, author, p)}</body></html>`;
  await render(ebook, async (page, html) => {
    await page.setViewportSize({ width: 1600, height: 2560 });
    await page.setContent(html);
    await page.screenshot({ path: path.join(dist, `${slug}-ebook-cover.jpg`), type: 'jpeg', quality: 92 });
  });

  // Paperback full wrap
  const spine = spineWidth(pages);
  const W = BLEED * 2 + 6 * 2 + spine;
  const H = BLEED * 2 + 9;
  const spineText = pages > 79
    ? `<div class="spinetext">${e(book.title)} &nbsp;&middot;&nbsp; ${e(author)}</div>` : '';
  const wrap = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size:${W}in ${H}in; margin:0; }
    html,body{margin:0;width:${W}in;height:${H}in;background:${p.paper};position:relative;overflow:hidden;
      -webkit-print-color-adjust:exact;print-color-adjust:exact;}
    ${frontCss('1in')}
    .front{left:${BLEED + 6 + spine}in;top:0;width:${6 + BLEED}in;height:${H}in;padding-right:${BLEED}in;}
    .spine{position:absolute;left:${BLEED + 6}in;top:0;width:${spine}in;height:${H}in;background:${p.accent};}
    .spinetext{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(90deg);white-space:nowrap;
      font-family:${SANS};font-size:8pt;letter-spacing:0.15em;color:${p.paper};text-transform:uppercase;}
    .back{position:absolute;left:0;top:0;width:${BLEED + 6}in;height:${H}in;box-sizing:border-box;
      padding:${BLEED + 0.9}in 0.75in 0 ${BLEED + 0.75}in;font-family:${FONT};color:${p.ink};}
    .back .lead{font-size:15pt;font-style:italic;line-height:1.35;margin:0 0 0.3in;}
    .back p{font-size:11pt;line-height:1.55;margin:0 0 0.16in;}
    .back .series{font-family:${SANS};font-size:8pt;letter-spacing:0.22em;text-transform:uppercase;color:${p.accent};margin-top:0.35in;}
    .barcode{position:absolute;right:0.5in;bottom:${BLEED + 0.5}in;width:2in;height:1.2in;background:#fff;}
  </style></head><body>
    <div class="back">
      <div class="lead">${e(book.backCover[0])}</div>
      ${book.backCover.slice(1).map(t => `<p>${e(t)}</p>`).join('')}
      <div class="series">${e(book.series)} &middot; Book ${book.seriesNumber}</div>
      <div class="barcode"></div>
    </div>
    <div class="spine">${spineText}</div>
    ${frontHtml(book, author, p)}
  </body></html>`;
  await render(wrap, async (page, html) => {
    await page.setContent(html);
    await page.pdf({ path: path.join(dist, `${slug}-paperback-cover.pdf`), width: `${W}in`, height: `${H}in`, printBackground: true, preferCSSPageSize: true });
  });
  console.log(`Covers for ${slug}: ${pages} interior pages, spine ${spine} in, wrap ${W.toFixed(4)} x ${H} in`);
  console.log(`  dist/${slug}-ebook-cover.jpg, dist/${slug}-paperback-cover.pdf`);
}

if (require.main === module) main().catch(err => { console.error(`ERROR ${err.message}`); process.exit(1); });

module.exports = { spineWidth };
