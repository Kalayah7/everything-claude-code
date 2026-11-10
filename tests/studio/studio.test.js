/**
 * Tests for examples/faith-studio/scripts (scripture lookup, product rules, money math)
 *
 * Run with: node tests/studio/studio.test.js
 * No network and no browser: PDF building is exercised by `studio.js build`.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('../../examples/faith-studio/scripts/lib');
const render = require('../../examples/faith-studio/scripts/render');
const cli = require('../../examples/faith-studio/scripts/studio');

const STUDIO = path.join(__dirname, '../../examples/faith-studio');
const REAL_CONFIG = JSON.parse(fs.readFileSync(path.join(STUDIO, 'studio.config.json'), 'utf8'));

const CONFIG = Object.freeze({
  ...REAL_CONFIG,
  goal: { monthlyNetTarget: 100 },
  taxReserveRate: 0.25,
  offers: [{ id: 'single', price: 10 }, { id: 'group', price: 50 }],
  channels: { etsy: { feePercent: 0.1, feeFixed: 0.5 }, store: { feePercent: 0.05, feeFixed: 0.5 } },
  assumptions: {
    offerMix: { single: 0.5, group: 0.5 },
    channelMix: { etsy: 0.5, store: 0.5 },
    conversionRate: 0.02,
    minOrdersForRealRates: 3,
    minVisitsForRealRates: 100,
    catalogTargetWeek12: 24
  }
});

const CHUNKS = Object.freeze([
  { type: 'line text', chapterNumber: 46, verseNumber: 9, value: 'He makes wars cease to the end of the earth. ' },
  { type: 'line break' },
  { type: 'line text', chapterNumber: 46, verseNumber: 10, value: '“Be still, and know that I am God. ' },
  { type: 'line text', chapterNumber: 46, verseNumber: 10, value: 'I will be exalted in the earth.” ' },
  { type: 'line text', chapterNumber: 47, verseNumber: 10, value: 'wrong chapter' }
]);

function day(n, overrides = {}) {
  return {
    day: n,
    title: `Day ${n}`,
    ref: `Psalm ${n}:1`,
    reflection: Array.from({ length: 60 }, () => 'word').join(' '),
    prompts: ['First question?', 'Second question?'],
    prayer: 'God, here is my prayer:',
    ...overrides
  };
}

function product(overrides = {}) {
  return {
    slug: 'test-journal',
    title: 'Test',
    subtitle: 'A test journal',
    intro: ['Hello.'],
    weeks: [{ title: 'Week 1', from: 1, to: 7 }],
    days: Array.from({ length: 7 }, (_, i) => day(i + 1)),
    ...overrides
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function runTests() {
  console.log('\n=== Testing faith-studio ===\n');
  let passed = 0;
  let failed = 0;
  const t = (name, fn) => (test(name, fn) ? passed++ : failed++);

  console.log('Scripture:');
  t('parses single verses, ranges and numbered books', () => {
    assert.deepStrictEqual({ ...lib.parseRef('Psalm 46:10') },
      { book: 'Psalm', file: 'psalms', chapter: 46, verseStart: 10, verseEnd: 10 });
    assert.strictEqual(lib.parseRef('1 Peter 5:6-7').file, '1peter');
    assert.strictEqual(lib.parseRef('1 Peter 5:6-7').verseEnd, 7);
    assert.strictEqual(lib.parseRef('Song of Solomon 2:11').file, 'songofsolomon');
  });
  t('rejects references it cannot read', () => {
    assert.throws(() => lib.parseRef('Psalm 46'));
    assert.throws(() => lib.parseRef('Psalm 46:10-9'));
    assert.throws(() => lib.parseRef(''));
  });
  t('joins a verse from its lines and ignores other chapters', () => {
    assert.strictEqual(lib.verseText(CHUNKS, lib.parseRef('Psalm 46:10')),
      '“Be still, and know that I am God. I will be exalted in the earth.”');
    assert.ok(lib.verseText(CHUNKS, lib.parseRef('Psalm 46:9-10')).startsWith('He makes wars cease'));
  });
  t('a missing verse is an error, never a blank', () => {
    assert.throws(() => lib.verseText(CHUNKS, lib.parseRef('Psalm 46:10-11')), /46:11 not found/);
  });
  t('tidies a range that ends mid-sentence', () => {
    assert.strictEqual(lib.tidyVerseEnding('wait for him;'), 'wait for him.');
    assert.strictEqual(lib.tidyVerseEnding('It is finished.'), 'It is finished.');
  });

  t('balances quote marks left over from a longer speech', () => {
    assert.strictEqual(lib.tidyVerse('Don’t be afraid.”'), 'Don’t be afraid.');
    assert.strictEqual(lib.tidyVerse('“Be still. I will be exalted.”'), 'Be still. I will be exalted.');
    assert.strictEqual(lib.tidyVerse('“Behold, I will do a new thing,'), 'Behold, I will do a new thing.');
    assert.strictEqual(lib.tidyVerse('For I know,” says Yahweh, “thoughts of peace.'),
      '“For I know,” says Yahweh, “thoughts of peace.”');
    assert.strictEqual(lib.tidyVerse('He said, “Come.”'), 'He said, “Come.”');
  });
  t('capitalizes a verse that starts mid-sentence without changing words', () => {
    assert.strictEqual(lib.tidyVerse('but those who wait will renew their strength.'), 'But those who wait will renew their strength.');
  });

  console.log('\nProduct rules:');
  t('a well-formed product passes', () => {
    assert.deepStrictEqual(lib.validateProduct(product()), []);
  });
  t('hand-typed verse text is rejected', () => {
    const errors = lib.validateProduct(product({ days: [day(1, { text: 'Be still' }), ...[2, 3, 4, 5, 6, 7].map(n => day(n))] }));
    assert.ok(errors.some(m => /do not type verse text/.test(m)));
  });
  t('long quotations in a reflection are rejected', () => {
    const quote = `He said, "${Array.from({ length: 20 }, () => 'quoted').join(' ')}" and ${Array.from({ length: 30 }, () => 'more').join(' ')}`;
    const errors = lib.validateProduct(product({ days: [day(1, { reflection: quote }), ...[2, 3, 4, 5, 6, 7].map(n => day(n))] }));
    assert.ok(errors.some(m => /long quotation/.test(m)));
  });
  t('promises we never make are rejected', () => {
    const bad = `${day(1).reflection} This prayer is guaranteed to work.`;
    const errors = lib.validateProduct(product({ days: [day(1, { reflection: bad }), ...[2, 3, 4, 5, 6, 7].map(n => day(n))] }));
    assert.ok(errors.some(m => /claim we never make/.test(m)));
  });
  t('duplicate verses, bad lengths and week gaps are caught', () => {
    const errors = lib.validateProduct(product({
      weeks: [{ title: 'Week 1', from: 1, to: 6 }],
      days: [day(1), day(2, { ref: 'Psalm 1:1' }), day(3, { reflection: 'Too short.' }), day(4), day(5), day(6), day(7)]
    }));
    assert.ok(errors.some(m => /used twice/.test(m)));
    assert.ok(errors.some(m => /reflection is 2 words/.test(m)));
    assert.ok(errors.some(m => /weeks must cover/.test(m)));
  });
  t('listing rules: 13 short unique tags, title length, AI disclosure', () => {
    const tags = Array.from({ length: 13 }, (_, i) => `tag ${i}`);
    const good = { etsyTitle: 'Title', etsyTags: tags, description: 'x'.repeat(300), disclosure: 'Made with AI tools, edited by a person.',
      pins: [{}, {}, {}] };
    assert.deepStrictEqual(lib.validateListing(good), []);
    const errors = lib.validateListing({ ...good, etsyTags: [...tags.slice(0, 11), 'this tag is far too long'], disclosure: 'Handmade.' });
    assert.ok(errors.some(m => /exactly 13/.test(m)));
    assert.ok(errors.some(m => /over 20 characters/.test(m)));
    assert.ok(errors.some(m => /disclosure/.test(m)));
  });
  t('every shipped product and listing passes the rules', () => {
    const slugs = cli.listSlugs(STUDIO);
    assert.ok(slugs.length >= 1);
    for (const slug of slugs) {
      const folder = path.join(STUDIO, 'products', slug);
      const p = JSON.parse(fs.readFileSync(path.join(folder, 'product.json'), 'utf8'));
      const l = JSON.parse(fs.readFileSync(path.join(folder, 'listing.json'), 'utf8'));
      assert.deepStrictEqual(lib.validateProduct(p), [], slug);
      assert.deepStrictEqual(lib.validateListing(l), [], slug);
      assert.strictEqual(p.slug, slug);
    }
  });

  console.log('\nRendering:');
  t('journal has one page per day plus front and back pages, with escaped text', () => {
    const p = product({ title: 'Wait & <See>' });
    const verses = Object.fromEntries(p.days.map(d => [d.ref, 'Verse text.']));
    const out = render.renderJournal(p, verses, REAL_CONFIG, 'a4');
    assert.strictEqual(out.pageCount, 4 + 7 + 1 + 1 + 2 + 1);
    assert.ok(out.html.includes('Wait &amp; &lt;See&gt;'));
    assert.ok(out.html.includes('210mm'));
    assert.throws(() => render.renderJournal(p, verses, REAL_CONFIG, 'tabloid'));
  });

  console.log('\nMoney math:');
  t('channel fees are estimated per unit when blank', () => {
    assert.strictEqual(lib.estimateChannelFee(10, CONFIG.channels.etsy), 1.5);
    const s = lib.summarizeMonth([{ date: '2026-11-03', channel: 'etsy', units: '3', gross: '30', fees: '', refunds: '', verified: 'yes' }], [], '2026-11', CONFIG);
    assert.strictEqual(s.fees, 4.5);
    assert.strictEqual(s.orders, 3);
    assert.strictEqual(s.net, 25.5);
  });
  t('only verified rows count; refunds and expenses reduce net', () => {
    const sales = [
      { date: '2026-11-03', channel: 'store', units: '1', gross: '50', fees: '3', refunds: '', verified: 'yes' },
      { date: '2026-11-04', channel: 'etsy', units: '1', gross: '10', fees: '1.5', refunds: '10', verified: 'yes' },
      { date: '2026-11-05', channel: 'etsy', units: '1', gross: '500', fees: '', refunds: '', verified: '' },
      { date: '2026-10-31', channel: 'etsy', units: '1', gross: '900', fees: '', refunds: '', verified: 'yes' }
    ];
    const s = lib.summarizeMonth(sales, [{ date: '2026-11-02', amount: '5' }], '2026-11', CONFIG);
    assert.strictEqual(s.gross, 60);
    assert.strictEqual(s.net, 40.5);
    assert.strictEqual(s.unverifiedGross, 500);
    assert.strictEqual(s.goalMet, false);
    assert.strictEqual(s.byChannel.store.orders, 1);
  });
  t('plan uses assumptions first, then real numbers', () => {
    assert.strictEqual(lib.assumedNetPerOrder(CONFIG), 27.25);
    const empty = lib.summarizeMonth([], [], '2026-11', CONFIG);
    const assumed = lib.planToGoal(CONFIG, empty, { visits: 0 });
    assert.strictEqual(assumed.netPerOrderIsReal, false);
    assert.strictEqual(assumed.totalOrdersAtGoal, 4);
    assert.strictEqual(assumed.visitsNeededAtGoal, 200);

    const sales = [{ date: '2026-11-03', channel: 'store', units: '4', gross: '40', fees: '4', refunds: '', verified: 'yes' }];
    const real = lib.planToGoal(CONFIG, lib.summarizeMonth(sales, [], '2026-11', CONFIG), { visits: 400 });
    assert.strictEqual(real.netPerOrderIsReal, true);
    assert.strictEqual(real.netPerOrder, 9);
    assert.strictEqual(real.conversion, 0.01);
    assert.strictEqual(real.ordersNeeded, 8);
  });
  t('csv output quotes commas and quotes', () => {
    assert.strictEqual(lib.toCsv(['a', 'b'], [['x, y', 'say "hi"']]), 'a,b\n"x, y","say ""hi"""\n');
  });

  console.log('\nWorkspace:');
  t('init creates data files once and never overwrites them', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
    assert.strictEqual(cli.initWorkspace(dir).length, 3);
    fs.appendFileSync(path.join(dir, 'finance', 'sales.csv'), '2026-11-02,etsy,single,x,1,8,,,yes,\n');
    assert.strictEqual(cli.initWorkspace(dir).length, 0);
    assert.ok(fs.readFileSync(path.join(dir, 'finance', 'sales.csv'), 'utf8').includes('etsy'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  t('private data and built products are git-ignored', () => {
    const ignore = fs.readFileSync(path.join(__dirname, '../../.gitignore'), 'utf8');
    for (const p of ['finance/*.csv', 'data/', 'products/*/dist/']) {
      assert.ok(ignore.includes(`examples/faith-studio/${p}`), `missing ignore rule for ${p}`);
    }
  });

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
