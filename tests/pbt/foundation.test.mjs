import assert from 'node:assert/strict';
import fc from 'fast-check';
import { compileDictionary, readCompactDictionary } from '../../scripts/lib/dictionary.mjs';
import { compareCase } from '../../scripts/lib/compare.mjs';
import { referencePatterns } from '../../scripts/lib/reference.mjs';
import { registerProperties } from '../support/pbt.mjs';
import { dictionaryEntries, toTSV, literal, unicodeText, reading, oracleInput } from '../support/arbitraries.mjs';

const load = readCompactDictionary;
const pattern = (needles) => `(?:${needles.map(RegExp.escape).join('|')})`;

registerProperties({
  'dictionary-prefix-model': fc.property(dictionaryEntries, (entries) => {
    const dictionary = load(compileDictionary(toTSV(entries)));
    const model = new Map(entries);
    const prefixes = new Set(['☃']); // Also exercise misses, not only existing keys.
    for (const [key, values] of model) {
      assert.deepEqual([...dictionary.search(key)].sort(), [...values].sort());
      for (let end = 1; end <= key.length; end++) prefixes.add(key.slice(0, end));
    }
    for (const prefix of prefixes) {
      const expected = entries.filter(([key]) => key.startsWith(prefix)).flatMap(([, values]) => values).sort();
      assert.deepEqual([...dictionary.predictiveSearch(prefix)].sort(), expected, `prefix=${prefix}`);
    }
  }),

  'dictionary-row-order': fc.property(dictionaryEntries, (entries) => {
    const original = compileDictionary(toTSV(entries));
    const sorted = compileDictionary(toTSV([...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
    assert.deepEqual(original, sorted);
    // Candidate order may change the encoding, but not the lookup multiset.
    const reordered = load(compileDictionary(toTSV(entries.map(([key, values]) => [key, [...values].reverse()]))));
    for (const [key, values] of entries) assert.deepEqual([...reordered.search(key)].sort(), [...values].sort());
  }),

  'dictionary-invalid-reading': fc.property(reading, literal, fc.constantFrom('😀', '\u3099', '\x7f', '\u0001', '漢'), (key, value, invalid) => {
    assert.throws(() => compileDictionary(toTSV([[key, [value]], [`${key}${invalid}`, [value]]])), /unsupported compact reading/);
  }),

  'regex-match-set-model': fc.property(
    fc.uniqueArray(literal, { minLength: 1, maxLength: 8 }),
    fc.uniqueArray(literal, { minLength: 1, maxLength: 8 }),
    fc.array(unicodeText, { maxLength: 24 }),
    (expected, actual, randomDocuments) => {
      const documents = ['', ...randomDocuments, ...expected, ...actual, ...expected.map((s) => `前${s}後`)];
      const missing = [], extra = [];
      documents.forEach((document, index) => {
        const wanted = expected.some((s) => document.includes(s));
        const got = actual.some((s) => document.includes(s));
        if (wanted && !got) missing.push({ index, document });
        if (!wanted && got) extra.push({ index, document });
      });
      const difference = compareCase({ id: 'pbt', class: 'generated' }, pattern(expected), pattern(actual), documents);
      if (!missing.length && !extra.length) assert.equal(difference, null);
      else {
        assert.equal(difference.kind, 'match-set');
        assert.deepEqual(difference.missing, missing);
        assert.deepEqual(difference.extra, extra);
      }
      assert.equal(compareCase({ id: 'reorder' }, pattern(expected), pattern([...expected].reverse()), documents), null);
    },
  ),

  'regex-candidate-loss': fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 999999 }), { minLength: 2, maxLength: 32 }), (ids) => {
    // Equal-length distinct literals guarantee a witness when one is removed.
    const values = ids.map((id) => `候補${String(id).padStart(6, '0')}終`);
    const difference = compareCase({ id: 'loss' }, pattern(values), pattern(values.slice(1)), values);
    assert.deepEqual(difference.missing, [{ index: 0, document: values[0] }]);
    assert.deepEqual(difference.extra, []);
  }),

  'reference-literal-and-history': fc.asyncProperty(oracleInput, oracleInput, async (input, other) => {
    const [first, , repeated] = await referencePatterns([input, other, input]);
    assert.equal(first.pattern, repeated.pattern);
    assert.ok(new RegExp(`^(?:${first.pattern})$`, 'u').test(input), JSON.stringify(input));
    assert.ok(new RegExp(first.pattern, 'u').test(`前${input}後`));
  }),
});
