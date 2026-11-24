#!/usr/bin/env node
/**
 * Press build tool: turns books/<slug>/manuscript/*.md into Amazon KDP files.
 *
 *   node scripts/press.js check <slug>   # resolve Scripture, run quality checks, word count
 *   node scripts/press.js build <slug>   # check, then write dist/: EPUB (Kindle) and 6x9 interior PDF
 *
 * Scripture is never typed into a manuscript. Write {{verse: Psalm 13:1-2}} on its own line for a
 * block quotation, or {{quote: John 11:35}} inline. The text is looked up from the public-domain
 * World English Bible (shared code with the faith studio). A missing verse stops the build.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const bible = require('../../faith-studio/scripts/lib');

const ROOT = path.resolve(__dirname, '..');
const BIBLE_BASE = 'https://raw.githubusercontent.com/TehShrike/world-english-bible/68669ba3be9719ae4d1135b19d9e0b6587b7c356/json';
const WEB_CREDIT = 'Scripture quotations are from the World English Bible (WEB), which is in the public domain. Where the WEB uses the name Yahweh, many other translations print "the LORD".';

// Phrases that make prose read as machine-written. The editor agent checks more; these are hard fails.
const BANNED = Object.freeze(['delve', 'tapestry', 'testament to', 'fast-paced world', 'navigate the complexities',
  "it's important to note", 'it is important to note', 'in this chapter we will', 'unlock your', 'embark on']);

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

function loadBibleBook(file) {
  const cache = path.join(ROOT, 'data', 'bible', `${file}.json`);
  if (!fs.existsSync(cache)) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    try {
      execFileSync('curl', ['-fsSL', '--max-time', '30', '-o', cache, `${BIBLE_BASE}/${file}.json`], { stdio: 'pipe' });
    } catch (err) {
      fs.rmSync(cache, { force: true });
      throw new Error(`could not download ${file}.json (${String(err.stderr || err.message).trim()})`);
    }
  }
  return readJson(cache);
}

function lookup(ref) {
  const parsed = bible.parseRef(ref);
  return bible.tidyVerse(bible.verseText(loadBibleBook(parsed.file), parsed));
}

/** Replace Scripture tags with looked-up text. Returns new text plus any errors. */
function resolveScripture(text, fileName, lookupFn = lookup) {
  const errors = [];
  const refs = [];
  const safe = (ref, fn) => {
    try { refs.push(ref.trim()); return fn(lookupFn(ref.trim())); } catch (err) { errors.push(`${fileName}: ${ref.trim()}: ${err.message}`); return `[MISSING ${ref}]`; }
  };
  const out = text
    .replace(/^\{\{verse:[ \t]*([^}]+)\}\}[ \t]*$/gm, (m, ref) => safe(ref, t => `> ${t}\n>\n> <span class="ref">${ref.trim()}</span>`))
    .replace(/\{\{quote:\s*([^}]+)\}\}/g, (m, ref) => safe(ref, t => `“${t.replace(/^“|”$/g, '')}” (${ref.trim()})`));
  if (/\{\{/.test(out)) errors.push(`${fileName}: an unrecognised {{...}} tag remains`);
  return { out, errors, refs };
}

function loadBook(slug) {
  const dir = path.join(ROOT, 'books', slug);
  if (!fs.existsSync(path.join(dir, 'book.json'))) throw new Error(`No books/${slug}/book.json`);
  const book = readJson(path.join(dir, 'book.json'));
  const config = readJson(path.join(ROOT, 'press.config.json'));
  const mdir = path.join(dir, 'manuscript');
  const files = fs.readdirSync(mdir).filter(f => /^\d\d-.*\.md$/.test(f)).sort();
  return { dir, book, config, files: files.map(f => ({ name: f, text: fs.readFileSync(path.join(mdir, f), 'utf8') })) };
}

function check(slug) {
  const { dir, book, config, files } = loadBook(slug);
  const errors = [];
  const warnings = [];
  const chapters = [];
  const seenRefs = new Map();
  let total = 0;
  for (const f of files) {
    const r = resolveScripture(f.text, f.name);
    errors.push(...r.errors);
    r.refs.forEach(ref => seenRefs.set(ref, (seenRefs.get(ref) || 0) + 1));
    if (!/^# \S/.test(f.text)) errors.push(`${f.name}: must start with "# Title"`);
    const lower = f.text.toLowerCase();
    BANNED.forEach(p => { if (lower.includes(p)) errors.push(`${f.name}: banned phrase "${p}"`); });
    if (/\s!\s|!{2,}/.test(f.text)) warnings.push(`${f.name}: exclamation marks`);
    if (/\b(TODO|TK|lorem ipsum)\b/i.test(f.text)) errors.push(`${f.name}: placeholder text`);
    const words = bible.wordCount(r.out.replace(/<[^>]+>/g, ' '));
    total += words;
    chapters.push({ file: f.name, words, text: r.out });
  }
  for (const [ref, n] of seenRefs) if (n > 1) warnings.push(`${ref} is quoted ${n} times`);
  if (!config.imprint.penName) warnings.push('press.config.json imprint.penName is empty: the founder must choose a pen name before upload');
  return { dir, book, config, chapters, total, errors, warnings };
}

function frontMatter(book, config) {
  const author = config.imprint.penName || 'Author Name';
  const year = new Date().getFullYear();
  const imprint = config.imprint.name ? `${config.imprint.name}\n\n` : '';
  return [
    `# {.unnumbered .unlisted}`,
    '',
    '<div class="copyright">',
    '',
    `*${book.title}: ${book.subtitle}*`,
    '',
    `Copyright © ${year} ${author}. All rights reserved. No part of this book may be reproduced without written permission, except for brief quotations in reviews.`,
    '',
    WEB_CREDIT,
    '',
    config.aiNotice,
    '',
    'This book is for encouragement and reflection. It is not medical, psychological, legal or financial advice. If you are struggling, please speak with a qualified professional.',
    '',
    imprint,
    '</div>',
    '',
    book.dedication ? `# {.unnumbered .unlisted}\n\n<div class="dedication">*${book.dedication}*</div>\n` : ''
  ].join('\n');
}

const PRINT_CSS = `
@page { size: 6in 9in; margin: 0.8in 0.75in 0.85in 0.75in; }
html { font-size: 11pt; }
body { font-family: 'Caladea', 'Charter', 'Georgia', 'Liberation Serif', serif; line-height: 1.5; color: #111; margin: 0; max-width: none; padding: 0; hyphens: auto; text-align: justify; }
header#title-block-header { page-break-after: always; text-align: center; padding-top: 2.2in; }
header .title { font-size: 28pt; font-weight: normal; margin: 0 0 0.2in; }
header .subtitle { font-size: 14pt; font-style: italic; margin: 0 0 1.2in; }
header .author { font-size: 12pt; letter-spacing: 0.12em; text-transform: uppercase; }
nav#TOC { page-break-after: always; }
nav#TOC::before { content: "Contents"; display: block; font-size: 18pt; margin: 0.6in 0 0.3in; text-align: center; }
nav#TOC ul { list-style: none; padding: 0; } nav#TOC li { margin: 0.06in 0; } nav#TOC a { color: inherit; text-decoration: none; }
h1 { font-size: 19pt; font-weight: normal; text-align: center; page-break-before: always; margin: 1.1in 0 0.45in; line-height: 1.2; }
h2 { font-size: 11.5pt; font-weight: bold; margin: 0.3in 0 0.08in; page-break-after: avoid; text-align: left; }
p { margin: 0; text-indent: 1.4em; orphans: 2; widows: 2; }
h1 + p, h2 + p, blockquote + p, ul + p, ol + p { text-indent: 0; }
blockquote { margin: 0.16in 0.3in; font-style: italic; page-break-inside: avoid; }
blockquote p { text-indent: 0; text-align: left; }
.ref { font-style: normal; font-size: 8.5pt; letter-spacing: 0.08em; text-transform: uppercase; }
ul, ol { margin: 0.08in 0 0.12in; padding-left: 1.4em; } li { margin: 0.04in 0; text-align: left; }
.dedication { text-align: center; margin-top: 2in; }
.copyright { margin-top: 3.2in; font-size: 8.5pt; } .copyright p { text-indent: 0; margin-bottom: 0.1in; text-align: left; }
`;

async function build(slug) {
  const result = check(slug);
  report(result);
  if (result.errors.length) process.exit(1);
  const { dir, book, config, chapters } = result;
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const author = config.imprint.penName || 'Author Name';
  const meta = ['---', `title: "${book.title}"`, `subtitle: "${book.subtitle}"`, `author: "${author}"`,
    `lang: ${book.language}`, `rights: "Copyright ${author}. ${WEB_CREDIT.replace(/"/g, "'")}"`,
    book.series ? `belongs-to-collection: "${book.series}"\ngroup-position: ${book.seriesNumber}` : '', '---', ''].join('\n');
  const body = [frontMatter(book, config), ...chapters.map(c => c.text)].join('\n\n');
  const md = path.join(dist, `${slug}.md`);
  fs.writeFileSync(md, meta + body);

  const css = path.join(dist, 'print.css');
  fs.writeFileSync(css, PRINT_CSS);
  const epub = path.join(dist, `${slug}.epub`);
  execFileSync('pandoc', [md, '-o', epub, '--toc', '--toc-depth=1', '--split-level=1', '-f', 'markdown+smart'], { stdio: 'inherit' });

  const html = path.join(dist, `${slug}-print.html`);
  execFileSync('pandoc', [md, '-o', html, '-s', '--toc', '--toc-depth=1', '-c', 'print.css', '-f', 'markdown+smart',
    '--metadata', `pagetitle=${book.title}`], { stdio: 'inherit' });
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'load' });
    await page.pdf({
      path: path.join(dist, `${slug}-interior-6x9.pdf`), width: '6in', height: '9in', preferCSSPageSize: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:center;font-size:8pt;font-family:serif;color:#444"><span class="pageNumber"></span></div>'
    });
  } finally {
    await browser.close();
  }
  console.log(`\nBuilt ${path.relative(ROOT, dist)}/: ${slug}.epub, ${slug}-interior-6x9.pdf`);
}

function report(r) {
  console.log(`${r.book.title}: ${r.book.subtitle}`);
  r.chapters.forEach(c => console.log(`  ${String(c.words).padStart(6)}  ${c.file}`));
  console.log(`  ${String(r.total).padStart(6)}  words in total`);
  r.warnings.forEach(w => console.log(`WARN  ${w}`));
  r.errors.forEach(e => console.log(`ERROR ${e}`));
  console.log(r.errors.length ? `\nCHECK FAILED (${r.errors.length})` : '\nCHECK PASSED');
}

async function main() {
  const [cmd, slug] = process.argv.slice(2);
  if (!slug || !['check', 'build'].includes(cmd)) {
    console.log('Usage: node scripts/press.js check|build <slug>');
    process.exit(2);
  }
  if (cmd === 'check') {
    const r = check(slug);
    report(r);
    process.exit(r.errors.length ? 1 : 0);
  }
  await build(slug);
}

if (require.main === module) main().catch(err => { console.error(`ERROR ${err.message}`); process.exit(1); });

module.exports = { resolveScripture, BANNED };
