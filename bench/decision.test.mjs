import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptionDecision, distribution } from './decision.mjs';

const fixture = () => ({ browsers: ['chromium'], runs: 3, codeBrotliBytes: { js: 100, 'wasm-gc': 80 },
  pairs: [1, 2, 3].map((run) => ({ browser: 'chromium', run,
    js: { compatibility: true, firstResponseMs: 100, queryP95Ms: 10 },
    'wasm-gc': { compatibility: true, firstResponseMs: 110, queryP95Ms: 12 } })) });

test('adoption accepts the exact declared size and startup boundaries on all three runs', () => {
  assert.equal(adoptionDecision(fixture()).eligible, true);
});
test('one startup regression or failed compatibility vetoes a size win', () => {
  for (const mutation of [
    (value) => { value.pairs[1]['wasm-gc'].firstResponseMs = 110.01; },
    (value) => { value.pairs[2]['wasm-gc'].compatibility = false; },
    (value) => { value.pairs[0]['wasm-gc'].queryP95Ms = NaN; },
  ]) {
    const value = fixture(); mutation(value);
    assert.equal(adoptionDecision(value).eligible, false);
  }
});
test('query improvement can substitute for size only when every run passes', () => {
  const value = fixture(); value.codeBrotliBytes['wasm-gc'] = 120;
  for (const pair of value.pairs) pair['wasm-gc'].queryP95Ms = 8;
  assert.equal(adoptionDecision(value).eligible, true);
  value.pairs[2]['wasm-gc'].queryP95Ms = 8.01;
  assert.equal(adoptionDecision(value).eligible, false);
});
test('missing, duplicate, insufficient, or unsupported browser measurements cannot pass', () => {
  const missing = fixture(); missing.pairs.pop();
  assert.equal(adoptionDecision(missing).complete, false);
  const few = fixture(); few.runs = 2; few.pairs.pop();
  assert.equal(adoptionDecision(few).eligible, false);
  const duplicate = fixture(); duplicate.pairs.push(duplicate.pairs[0]);
  assert.throws(() => adoptionDecision(duplicate), /duplicate/);
  const unsupported = fixture(); unsupported.pairs[1]['wasm-gc'] = { compatibility: false, error: 'UnsupportedBackend' };
  assert.equal(adoptionDecision(unsupported).eligible, false);
  const multi = fixture(); multi.browsers.push('webkit');
  assert.equal(adoptionDecision(multi).eligible, false);
});
test('nearest-rank statistics preserve timer zeros and reject invalid samples', () => {
  assert.deepEqual(distribution(Array.from({ length: 100 }, (_, i) => i)), {
    count: 100, min: 0, median: 49, p95: 94, p99: 98, max: 99, zeroCount: 1,
  });
  for (const values of [[], [NaN], [-1], [Infinity]]) assert.throws(() => distribution(values));
});
