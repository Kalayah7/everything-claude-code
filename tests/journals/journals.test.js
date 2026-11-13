/**
 * Tests for examples/life-journals/scripts (journal rules and page rendering)
 *
 * Run with: node tests/journals/journals.test.js
 * No network and no browser: PDF building is exercised by `build.js build`.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const lib = require('../../examples/life-journals/scripts/lib');
const render = require('../../examples/life-journals/scripts/render');
const cli = require('../../examples/life-journals/scripts/build');

const CONFIG = JSON.parse(fs.readFileSync(path.join(cli.ROOT, 'journals.config.json'), 'utf8'));
const READ = Array.from({ length: 50 }, () => 'word').join(' ') + '.';

function sample(overrides = {}) {
  return {
    slug: 'sample', title: 'Sample', subtitle: 'Sub', audience: 'People', label: 'Guided journal',
    intro: ['Hello.'], howTo: ['Write.'], beginPrompts: ['Start'], closing: ['Done.'], closingPrompts: ['End'],
    help: [{ name: 'Help', detail: 'Call.' }], sources: ['A study.'],
    parts: [{ title: 'One', from: 1, to: 2, pausePrompts: ['a', 'b'], worksheets: [{ title: 'Sheet', columns: [{ label: 'A' }, { label: 'B' }], rows: 3 }] }],
    days: [1, 2].map(day => ({ day, title: `Day ${day}`, read: READ, prompts: ['One', 'Two'], try: 'Do it.' })),
    ...overrides
  };
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); } catch (err) { failed += 1; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('Life journals');

test('a well-formed journal has no problems', () => assert.deepStrictEqual(lib.validateJournal(sample()), []));

test('a reading that is too short or too long is reported', () => {
  const days = sample().days.map(d => (d.day === 1 ? { ...d, read: 'Too short.' } : d));
  assert.ok(lib.validateJournal(sample({ days })).some(m => /day 1: the reading is 2 words/.test(m)));
});

test('a day needs exactly two prompts and a step to try', () => {
  const days = sample().days.map(d => (d.day === 2 ? { ...d, prompts: ['Only one'], try: '' } : d));
  const errors = lib.validateJournal(sample({ days }));
  assert.ok(errors.some(m => /day 2: needs exactly two prompts/.test(m)));
  assert.ok(errors.some(m => /day 2: no "try this" step/.test(m)));
});

test('parts must cover every day with no gap', () => {
  const parts = [{ ...sample().parts[0], to: 1 }];
  assert.ok(lib.validateJournal(sample({ parts })).some(m => /cover days 1 to 1 but there are 2 days/.test(m)));
});

test('promises and anti-care phrases are blocked', () => {
  for (const bad of ['Results are guaranteed.', 'Use this instead of therapy.', 'You should stop taking your medication.', 'Just cheer up.', 'A fact [CHECK].']) {
    assert.ok(lib.validateJournal(sample({ intro: [bad] })).length > 0, bad);
  }
});

test('reading grade rises with longer words and sentences', () => {
  const easy = lib.readingGrade('The cat sat on the mat. It was a good day. We ran home.');
  const hard = lib.readingGrade('Notwithstanding considerable institutional reservations, the administration implemented comprehensive organizational restructuring immediately.');
  assert.ok(easy < 4 && hard > 12, `${easy} ${hard}`);
});

test('a journal above its reading grade limit is reported', () => {
  const read = Array.from({ length: 12 }, () => 'Organizational administration necessitates comprehensive institutional reconsideration.').join(' ');
  const days = sample().days.map(d => ({ ...d, read }));
  assert.ok(lib.validateJournal(sample({ maxGrade: 7, days })).some(m => /grade level/.test(m)));
});

test('rendering makes one page per day plus front, pause, worksheet and back pages', () => {
  const out = render.renderJournal(sample(), CONFIG, 'letter');
  assert.strictEqual(out.pageCount, 4 + 2 + 1 + 1 + 3);
  assert.strictEqual((out.html.match(/class="page day"/g) || []).length, 2);
});

test('rendering escapes text and rejects unknown page sizes', () => {
  const out = render.renderJournal(sample({ title: 'A <b> & C' }), CONFIG, 'a4');
  assert.ok(out.html.includes('A &lt;b&gt; &amp; C'));
  assert.throws(() => render.renderJournal(sample(), CONFIG, 'poster'), /Unknown page size/);
});

for (const slug of cli.listSlugs()) {
  test(`${slug}: passes every rule`, () => {
    const { errors } = cli.loadJournal(slug);
    assert.deepStrictEqual(errors, []);
  });
  test(`${slug}: gives a crisis line and says what it is not`, () => {
    const { journal } = cli.loadJournal(slug);
    assert.ok(journal.help.some(h => /988/.test(h.name + h.detail)));
    assert.ok(/988/.test(journal.careNote || CONFIG.careNote));
    assert.ok(/not/.test(journal.notAdvice || CONFIG.notAdvice));
  });
  test(`${slug}: has a listing with a care note, an AI disclosure and no banned claims`, () => {
    const text = fs.readFileSync(path.join(cli.ROOT, 'marketing', `${slug}.md`), 'utf8');
    assert.ok(/How it was made/.test(text) && /It is not/.test(text));
    const selling = text.split('## Evidence used')[0].replace(/"[^"]*"/g, '');
    assert.ok(!/clinically proven|therapist approved|guaranteed|\bcures?\b/i.test(selling));
  });
}

test('the three journals asked for are all present', () => {
  assert.deepStrictEqual(cli.listSlugs(), ['money-on-my-mind', 'money-step-by-step', 'not-just-me']);
});

console.log(`\nPassed: ${passed}\nFailed: ${failed}\nTotal: ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
