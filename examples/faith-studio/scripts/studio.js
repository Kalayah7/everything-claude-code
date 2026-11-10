#!/usr/bin/env node
/**
 * Faith studio operating CLI.
 *
 * Usage (from examples/faith-studio/):
 *   node scripts/studio.js init                       Create the private (git-ignored) data files
 *   node scripts/studio.js verify <slug>              Validate a product and look up every verse
 *   node scripts/studio.js build <slug> | --all       PDFs, listing images, pins and copy sheet -> products/<slug>/dist/
 *   node scripts/studio.js status [--month YYYY-MM]   Goal progress in verified dollars
 *   node scripts/studio.js plan                       Orders and visits needed to hit the goal
 *   node scripts/studio.js check                      Launch-readiness checklist
 *
 * Options:
 *   --dir <path>   Studio workspace (default: the folder above this script)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const lib = require('./lib');
const render = require('./render');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[a.slice(2)] = next;
        i++;
      } else {
        args[a.slice(2)] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const DATA_FILES = Object.freeze({
  'finance/sales.csv': 'date,channel,offer,product,units,gross,fees,refunds,verified,note',
  'finance/expenses.csv': 'date,vendor,description,amount',
  'finance/traffic.csv': 'date,channel,visits'
});

function initWorkspace(dir) {
  const created = [];
  for (const [rel, header] of Object.entries(DATA_FILES)) {
    const p = path.join(dir, rel);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, header + '\n');
      created.push(rel);
    }
  }
  return created;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadConfig(dir) {
  return readJson(path.join(dir, 'studio.config.json'));
}

function readCsv(dir, rel) {
  const p = path.join(dir, rel);
  return fs.existsSync(p) ? lib.parseCsv(fs.readFileSync(p, 'utf8')) : [];
}

function listSlugs(dir) {
  const root = path.join(dir, 'products');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter(s => fs.existsSync(path.join(root, s, 'product.json'))).sort();
}

function loadProduct(dir, slug) {
  const folder = path.join(dir, 'products', slug);
  if (!fs.existsSync(path.join(folder, 'product.json'))) {
    throw new Error(`No product "${slug}". Known products: ${listSlugs(dir).join(', ') || '(none)'}`);
  }
  const product = readJson(path.join(folder, 'product.json'));
  const listingPath = path.join(folder, 'listing.json');
  return { folder, product, listing: fs.existsSync(listingPath) ? readJson(listingPath) : null };
}

// ---------------------------------------------------------------------------
// Scripture: fetched once per book from a pinned commit, then cached
// ---------------------------------------------------------------------------

function loadBook(dir, config, file) {
  const cache = path.join(dir, 'data', 'bible', `${file}.json`);
  if (!fs.existsSync(cache)) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    const url = `${config.scripture.sourceBaseUrl}/${file}.json`;
    try {
      execFileSync('curl', ['-fsSL', '--max-time', '30', '-o', cache, url], { stdio: 'pipe' });
    } catch (err) {
      fs.rmSync(cache, { force: true });
      throw new Error(`Could not download ${url}. Check the book name and the network. (${String(err.stderr || err.message).trim()})`);
    }
  }
  return readJson(cache);
}

function loadVerses(dir, config, product) {
  const verses = {};
  const errors = [];
  for (const d of product.days || []) {
    try {
      const parsed = lib.parseRef(d.ref);
      verses[d.ref] = lib.tidyVerse(lib.verseText(loadBook(dir, config, parsed.file), parsed));
    } catch (err) {
      errors.push(`day ${d.day}: ${err.message}`);
    }
  }
  return { verses, errors };
}

function verifyProduct(dir, slug) {
  const config = loadConfig(dir);
  const { folder, product, listing } = loadProduct(dir, slug);
  const errors = [...lib.validateProduct(product)];
  if (product.slug !== slug) errors.push(`slug "${product.slug}" does not match folder "${slug}"`);
  const { verses, errors: verseErrors } = loadVerses(dir, config, product);
  errors.push(...verseErrors);
  if (listing) errors.push(...lib.validateListing(listing).map(m => `listing: ${m}`));
  else errors.push('listing.json is missing');
  return { config, folder, product, listing, verses, errors };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    throw new Error('Building PDFs needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).');
  }
}

function listingSheet(product, listing, config, pageCount) {
  const offer = id => config.offers.find(o => o.id === id);
  const lines = [
    `${product.title}: listing copy sheet`,
    '='.repeat(60),
    '',
    'ETSY TITLE', listing.etsyTitle, '',
    'ETSY TAGS (13)', listing.etsyTags.join(', '), '',
    `PRICE  Etsy/own store single: $${offer('single').price}   Group license: $${offer('group').price}`,
    `FILES TO UPLOAD  ${product.slug}-letter.pdf, ${product.slug}-a4.pdf  (${pageCount} pages each)`,
    'IMAGES  listing-1-cover.png, listing-2-inside.png, listing-3-included.png', '',
    'DESCRIPTION', listing.description.replace(/\{\{PAGES\}\}/g, String(pageCount)), '',
    'HOW IT WAS MADE (paste at the end of the description and use for any AI disclosure field)', listing.disclosure, '',
    'OWN-STORE SHORT DESCRIPTION', listing.shortDescription || '', ''
  ];
  return lines.join('\n');
}

async function buildProduct(dir, slug, log) {
  const v = verifyProduct(dir, slug);
  if (v.errors.length > 0) {
    throw new Error(`"${slug}" failed verification:\n  - ${v.errors.join('\n  - ')}`);
  }
  const { config, folder, product, listing, verses } = v;
  const dist = path.join(folder, 'dist');
  fs.mkdirSync(dist, { recursive: true });

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  try {
    let pageCount = 0;
    for (const sizeKey of Object.keys(render.SIZES)) {
      const journal = render.renderJournal(product, verses, config, sizeKey);
      pageCount = journal.pageCount;
      const page = await browser.newPage();
      await page.setContent(journal.html, { waitUntil: 'load' });
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll('.page')].map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? i + 1 : 0)).filter(Boolean));
      if (overflow.length > 0) {
        throw new Error(`Text does not fit on ${sizeKey} page(s) ${overflow.join(', ')}. Shorten that day's reflection or prompts.`);
      }
      const size = render.SIZES[sizeKey];
      await page.pdf({ path: path.join(dist, `${slug}-${sizeKey}.pdf`), width: size.width, height: size.height, printBackground: true });
      await page.close();
      log(`  wrote dist/${slug}-${sizeKey}.pdf (${pageCount} pages)`);
    }

    // Page pictures for the listing images and pins.
    const letter = render.renderJournal(product, verses, config, 'letter');
    const shotPage = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 1.5 });
    await shotPage.setContent(letter.html, { waitUntil: 'load' });
    const shoot = async selector => {
      const buf = await shotPage.locator(selector).first().screenshot({ type: 'jpeg', quality: 88 });
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    };
    const dayPages = shotPage.locator('.page.day');
    const dayShot = async i => {
      const buf = await dayPages.nth(i).screenshot({ type: 'jpeg', quality: 88 });
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    };
    const shots = {
      cover: await shoot('.page.cover'),
      pages: [await dayShot(0), await shoot('.page.pause'), await shoot('.page.list')]
    };
    await shotPage.close();

    const images = render.renderListingImages(product, listing, config, shots, letter.pageCount);
    const snap = async (name, html, width, height) => {
      const p = await browser.newPage({ viewport: { width, height } });
      await p.setContent(html, { waitUntil: 'load' });
      await p.screenshot({ path: path.join(dist, `${name}.png`) });
      await p.close();
      log(`  wrote dist/${name}.png`);
    };
    for (const [name, html] of Object.entries(images)) await snap(name, html, 2000, 1500);

    const link = listing.storeUrl || config.brand.storeUrl || '';
    const pinRows = [];
    for (let i = 0; i < listing.pins.length; i++) {
      const pin = listing.pins[i];
      const name = `pin-${i + 1}`;
      await snap(name, render.renderPin(product, pin, config, shots.cover), 1000, 1500);
      pinRows.push([`${name}.png`, pin.title, pin.description, link, pin.board || config.pinterest.defaultBoard]);
    }
    fs.writeFileSync(path.join(dist, 'pins.csv'), lib.toCsv(['image', 'title', 'description', 'link', 'board'], pinRows));
    fs.writeFileSync(path.join(dist, 'LISTING.txt'), listingSheet(product, listing, config, letter.pageCount));
    log('  wrote dist/pins.csv and dist/LISTING.txt');
    return { dist, pageCount: letter.pageCount };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getSummary(dir, month) {
  const config = loadConfig(dir);
  const summary = lib.summarizeMonth(readCsv(dir, 'finance/sales.csv'), readCsv(dir, 'finance/expenses.csv'), month, config);
  const traffic = lib.sumVisits(readCsv(dir, 'finance/traffic.csv'), month);
  return { config, summary, traffic };
}

function statusReport(dir, month) {
  const { config, summary: s } = getSummary(dir, month);
  const m = lib.money;
  const lines = [
    `${config.brand.name}: ${s.month}`,
    `Net in pocket (verified): ${m(s.net)} / ${m(s.target)}  ${lib.progressBar(s.progress)} ${Math.round(s.progress * 100)}%`,
    `  Sales ${m(s.gross)} from ${s.orders} orders  - refunds ${m(s.refunds)}  - fees ${m(s.fees)}  - expenses ${m(s.expenses)}`,
    ...Object.entries(s.byChannel).map(([c, v]) => `  ${c}: ${v.orders} orders, ${m(v.gross)}`),
    `  Set aside for tax (${Math.round((config.taxReserveRate || 0) * 100)}%): ${m(s.taxReserve)}`,
    s.unverifiedCount > 0
      ? `  Not counted: ${s.unverifiedCount} unverified row(s) worth ${m(s.unverifiedGross)}. Mark verified=yes once the payout is confirmed.`
      : '',
    `Products with a product.json: ${listSlugs(dir).length}`,
    `GOAL MET THIS MONTH: ${s.goalMet ? 'YES' : 'NO'}${s.goalMet ? '' : ` (${m(s.gap)} to go)`}`
  ];
  return lines.filter(Boolean).join('\n');
}

function planReport(dir, month) {
  const { config, summary, traffic } = getSummary(dir, month);
  const p = lib.planToGoal(config, summary, traffic);
  const m = lib.money;
  const pct = n => `${(n * 100).toFixed(1)}%`;
  return [
    `Plan to ${m(summary.target)}/month net`,
    `  Net per order: ${m(p.netPerOrder)} (${p.netPerOrderIsReal ? 'real' : 'assumed from the offer mix in config'})`,
    `  Orders needed for the full goal: ${p.totalOrdersAtGoal} a month, about ${p.ordersPerDayAtGoal} a day`,
    `  Still needed this month: ${p.ordersNeeded} orders`,
    `  Visit-to-order rate: ${pct(p.conversion)} (${p.conversionIsReal ? 'real' : 'assumed'})`,
    `  Listing and store visits needed at the goal: about ${p.visitsNeededAtGoal.toLocaleString('en-US')} a month`,
    `  Catalog: ${listSlugs(dir).length} product(s). Target by week 12: ${config.assumptions.catalogTargetWeek12}.`,
    p.netPerOrderIsReal ? '' : `  These switch to real numbers after ${config.assumptions.minOrdersForRealRates} verified orders.`
  ].filter(Boolean).join('\n');
}

function checkReport(dir) {
  const config = loadConfig(dir);
  const items = [];
  const item = (ok, who, text) => items.push({ ok, who, text });
  const slugs = listSlugs(dir);

  item(fs.existsSync(path.join(dir, 'finance/sales.csv')), 'staff', 'Private data files exist (run `init`)');
  item(slugs.length >= 1, 'staff', 'At least one product is written');
  for (const slug of slugs) {
    let errors;
    try {
      errors = verifyProduct(dir, slug).errors;
    } catch (err) {
      errors = [err.message];
    }
    item(errors.length === 0, 'staff', `${slug}: passes verification${errors.length ? ` (${errors.length} problem(s); run verify)` : ''}`);
    item(fs.existsSync(path.join(dir, 'products', slug, 'dist', `${slug}-letter.pdf`)), 'staff', `${slug}: built (run \`build ${slug}\`)`);
  }
  item(!config.brand.nameIsPlaceholder, 'founder', 'Brand name chosen and checked (set brand.nameIsPlaceholder to false)');
  item(Boolean(config.brand.contactEmail), 'founder', 'Brand email address set (brand.contactEmail)');
  item(Boolean(config.brand.storeUrl), 'founder', 'Own store is open (brand.storeUrl)');
  item(Boolean(config.channels.etsy.url), 'founder', 'Etsy shop is open (channels.etsy.url)');
  item(Boolean(config.pinterest.profileUrl), 'founder', 'Pinterest business account is open (pinterest.profileUrl)');
  item(Boolean(config.brand.founderReviewedPolicies), 'founder', 'Founder has read Etsy\'s current AI and creativity rules (brand.founderReviewedPolicies)');

  const lines = items.map(i => `[${i.ok ? 'x' : ' '}] (${i.who}) ${i.text}`);
  const open = items.filter(i => !i.ok);
  lines.push('', open.length === 0 ? 'READY TO LAUNCH' : `${open.length} item(s) open: ${open.filter(i => i.who === 'founder').length} for the founder, ${open.filter(i => i.who === 'staff').length} for the staff`);
  return { text: lines.join('\n'), ready: open.length === 0 };
}

// ---------------------------------------------------------------------------

async function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  const dir = path.resolve(args.dir || path.join(__dirname, '..'));
  const month = typeof args.month === 'string' ? args.month : currentMonth();
  const out = s => process.stdout.write(s + '\n');

  switch (cmd) {
    case 'init': {
      const created = initWorkspace(dir);
      out(created.length ? `Created: ${created.join(', ')}` : 'Nothing to create. Data files already exist.');
      return 0;
    }
    case 'verify': {
      const slugs = args.all ? listSlugs(dir) : [args._[1]];
      if (!slugs[0]) throw new Error('Usage: studio.js verify <slug> | --all');
      let failed = 0;
      for (const slug of slugs) {
        const { errors, product } = verifyProduct(dir, slug);
        if (errors.length) failed++;
        out(errors.length ? `${slug}: ${errors.length} problem(s)\n  - ${errors.join('\n  - ')}`
          : `${slug}: OK (${product.days.length} days, every verse found in the ${loadConfig(dir).scripture.abbreviation})`);
      }
      return failed ? 1 : 0;
    }
    case 'build': {
      const slugs = args.all ? listSlugs(dir) : [args._[1]];
      if (!slugs[0]) throw new Error('Usage: studio.js build <slug> | --all');
      for (const slug of slugs) {
        out(`Building ${slug}`);
        await buildProduct(dir, slug, out);
      }
      return 0;
    }
    case 'status':
      out(statusReport(dir, month));
      return 0;
    case 'plan':
      out(planReport(dir, month));
      return 0;
    case 'check': {
      const report = checkReport(dir);
      out(report.text);
      return 0;
    }
    default:
      out('Usage: studio.js init | verify <slug> | build <slug> | status [--month YYYY-MM] | plan | check');
      return cmd ? 1 : 0;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    err => {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    }
  );
}

module.exports = { parseArgs, initWorkspace, loadVerses, verifyProduct, buildProduct, statusReport, planReport, checkReport, listSlugs, main };
