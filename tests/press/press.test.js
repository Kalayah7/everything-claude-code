/**
 * Tests for examples/amazon-press/scripts/press.js (Scripture tags in manuscripts)
 *
 * Run with: node tests/press/press.test.js
 * No network and no browser: building is exercised by `press.js build`.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { resolveScripture, BANNED } = require('../../examples/amazon-press/scripts/press');

const FAKE = Object.freeze({ 'John 11:35': 'Jesus wept.', 'Psalm 46:10': '“Be still, and know that I am God.”' });
const lookup = ref => {
  if (!(ref in FAKE)) throw new Error('not found');
  return FAKE[ref];
};

let passed = 0;
let failed = 0;
function t(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
}

function runTests() {
  console.log('\n=== Testing press.js ===\n');

  t('a verse tag on its own line becomes a block quote with its reference', () => {
    const r = resolveScripture('Before.\n\n{{verse: John 11:35}}\n\nAfter.', 'a.md', lookup);
    assert.deepStrictEqual(r.errors, []);
    assert.ok(r.out.includes('> Jesus wept.\n>\n> <span class="ref">John 11:35</span>'));
  });
  t('the paragraph after a verse stays outside the quote', () => {
    const r = resolveScripture('{{verse: John 11:35}}\n\nAfter.', 'a.md', lookup);
    assert.ok(r.out.endsWith('</span>\n\nAfter.'), JSON.stringify(r.out));
  });
  t('an inline quote tag gets one pair of quotation marks and the reference', () => {
    const r = resolveScripture('He said {{quote: Psalm 46:10}} once.', 'a.md', lookup);
    assert.strictEqual(r.out, 'He said “Be still, and know that I am God.” (Psalm 46:10) once.');
  });
  t('a missing verse is an error, never silent', () => {
    const r = resolveScripture('{{verse: Psalm 999:1}}', 'b.md', lookup);
    assert.strictEqual(r.errors.length, 1);
    assert.ok(r.errors[0].startsWith('b.md: Psalm 999:1'));
  });
  t('an unknown tag is an error', () => {
    const r = resolveScripture('{{verse John 11:35}}', 'c.md', lookup);
    assert.ok(r.errors.some(e => e.includes('unrecognised')));
  });
  t('references are recorded for duplicate checks', () => {
    const r = resolveScripture('{{verse: John 11:35}}\n\n{{quote: John 11:35}}', 'd.md', lookup);
    assert.deepStrictEqual(r.refs, ['John 11:35', 'John 11:35']);
  });
  t('banned phrases are lower case so the check can compare case-insensitively', () => {
    BANNED.forEach(p => assert.strictEqual(p, p.toLowerCase()));
  });
  t('built books and the Bible cache are git-ignored', () => {
    const ignore = fs.readFileSync(path.join(__dirname, '../../.gitignore'), 'utf8');
    for (const p of ['data/', 'books/*/dist/']) {
      assert.ok(ignore.includes(`examples/amazon-press/${p}`), `missing ignore rule for ${p}`);
    }
  });

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
