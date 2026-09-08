import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibilityEligibility } from './provenance.mjs';

function fixture() {
  const expected = { artifactSha256: Object.fromEntries(['index.js', 'core.js', 'core.wasm', 'feature-bytes.js'].map((name, i) => [name, String(i).repeat(64)])),
    dictionarySha256: 'a'.repeat(64), sourceSha256: 'b'.repeat(64), inputSha256: 'c'.repeat(64), documentsSha256: 'd'.repeat(64),
    reference: { name: 'C/Migemo', version: '1.8.0', commit: 'fixed', sha256: 'e'.repeat(64), flags: 'u', tables: ['roma.dat'], operators: ['|'] } };
  const report = { status: 'passed', artifacts: { files: structuredClone(expected.artifactSha256) }, reference: structuredClone(expected.reference),
    results: ['js', 'wasm-gc'].map((backend) => ({ fixture: 'practical', backend, inputs: 10_000, cases: 10_010, comparisons: 200_000,
      mismatches: 0, failures: [], dictionary: { sha256: expected.dictionarySha256, sourceSha256: expected.sourceSha256 },
      inputSha256: expected.inputSha256, documentsSha256: expected.documentsSha256 })) };
  return { expected, report };
}
test('a complete two-backend report binds code, dictionary, corpus and C reference', () => {
  const { expected, report } = fixture();
  assert.equal(compatibilityEligibility(report, expected).status, 'verified');
});
test('stale artifacts, data, input corpus, documents and reference cannot qualify', () => {
  for (const mutate of [
    (r) => { r.artifacts.files['core.wasm'] = 'f'.repeat(64); },
    (r) => { delete r.artifacts.files['feature-bytes.js']; },
    (r) => { r.results[0].dictionary.sha256 = 'f'.repeat(64); },
    (r) => { r.results[1].dictionary.sourceSha256 = 'f'.repeat(64); },
    (r) => { r.results[1].inputSha256 = 'f'.repeat(64); },
    (r) => { r.results[0].documentsSha256 = 'f'.repeat(64); },
    (r) => { r.reference.flags = ''; },
  ]) {
    const { expected, report } = fixture(); mutate(report);
    assert.throws(() => compatibilityEligibility(report, expected), /prerequisite/);
  }
});
test('running, undersized, missing, duplicate, and failed lanes fail closed', () => {
  for (const mutate of [
    (r) => { r.status = 'failed'; },
    (r) => { r.results[0].inputs = 9999; },
    (r) => { r.results.pop(); },
    (r) => { r.results.push(r.results[0]); },
    (r) => { r.results[0].mismatches = 1; },
    (r) => { r.results[0].failures = [{ kind: 'match-set' }]; },
  ]) {
    const { expected, report } = fixture(); mutate(report);
    assert.throws(() => compatibilityEligibility(report, expected), /prerequisite/);
  }
});
