#!/usr/bin/env node
/**
 * Life journals: check and build the printable journals.
 *
 *   node scripts/build.js list
 *   node scripts/build.js verify [slug]     check the rules (no browser needed)
 *   node scripts/build.js build [slug]      write PDFs to journals/<slug>/dist/
 *
 * With no slug, every journal is checked or built.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');
const render = require('./render');

const ROOT = path.join(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listSlugs(root = ROOT) {
  const dir = path.join(root, 'journals');
  return fs.readdirSync(dir).filter(s => fs.existsSync(path.join(dir, s, 'journal.json'))).sort();
}

function loadJournal(slug, root = ROOT) {
  const file = path.join(root, 'journals', slug, 'journal.json');
  if (!fs.existsSync(file)) throw new Error(`No journal called "${slug}". Try: ${listSlugs(root).join(', ')}`);
  const journal = readJson(file);
  const errors = lib.validateJournal(journal);
  if (journal.slug !== slug) errors.push(`slug is "${journal.slug}" but the folder is "${slug}"`);
  return { journal, errors };
}

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    throw new Error('Building PDFs needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).');
  }
}

async function buildJournal(slug, log, root = ROOT) {
  const { journal, errors } = loadJournal(slug, root);
  if (errors.length > 0) throw new Error(`"${slug}" failed its checks:\n  - ${errors.join('\n  - ')}`);
  const config = readJson(path.join(root, 'journals.config.json'));
  const dist = path.join(root, 'journals', slug, 'dist');
  fs.mkdirSync(dist, { recursive: true });

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  try {
    for (const sizeKey of Object.keys(render.SIZES)) {
      const out = render.renderJournal(journal, config, sizeKey);
      const page = await browser.newPage();
      await page.setContent(out.html, { waitUntil: 'load' });
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll('.page')].map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? i + 1 : 0)).filter(Boolean));
      if (overflow.length > 0) {
        throw new Error(`"${slug}": text does not fit on ${sizeKey} page(s) ${overflow.join(', ')}. Shorten the text on those pages.`);
      }
      const size = render.SIZES[sizeKey];
      await page.pdf({ path: path.join(dist, `${slug}-${sizeKey}.pdf`), width: size.width, height: size.height, printBackground: true });
      await page.close();
      log(`  wrote journals/${slug}/dist/${slug}-${sizeKey}.pdf (${out.pageCount} pages)`);
    }
  } finally {
    await browser.close();
  }
}

async function main(argv, log = console.log) {
  const [command = 'list', slug] = argv;
  const slugs = slug ? [slug] : listSlugs();
  if (command === 'list') {
    slugs.forEach(s => { const { journal } = loadJournal(s); log(`${s}: ${journal.title} (${journal.days.length} days)`); });
    return 0;
  }
  if (command === 'verify') {
    let bad = 0;
    for (const s of slugs) {
      const { journal, errors } = loadJournal(s);
      const grade = lib.readingGrade(journal.days.map(d => d.read).join(' '));
      log(`${s}: ${errors.length === 0 ? 'OK' : 'PROBLEMS'} (${journal.days.length} days, reading grade ${grade})`);
      errors.forEach(m => log(`  - ${m}`));
      bad += errors.length;
    }
    return bad === 0 ? 0 : 1;
  }
  if (command === 'build') {
    for (const s of slugs) { log(`Building ${s}`); await buildJournal(s, log); }
    return 0;
  }
  log('Usage: node scripts/build.js list | verify [slug] | build [slug]');
  return 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => process.exit(code)).catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { ROOT, listSlugs, loadJournal, buildJournal, main };
