import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { path } from '../../scripts/lib/common.mjs';
import { compareCase, compareQueries } from '../../scripts/lib/compare.mjs';
import { loadFixtures } from '../../scripts/lib/fixtures.mjs';

const c = { id: 'sentinel', class: 'dictionary', input: 'kensaku' };
const docs = ['', '検索', 'けんさく', 'ケンサク', '無関係', '前検索後'];
const expected = '(検索|けんさく|ケンサク)';

test('equivalent reordered/factored regexes pass without string equality', () => {
  assert.equal(compareCase(c, expected, '(?:ケンサク|検索|けんさく)', docs), null);
  assert.equal(compareCase(c, '(検索|検索機)', '検索(?:機)?', [...docs, '検索機']), null);
});

test('mutation sentinels catch lost candidates, overmatching, anchoring, syntax, type and exceptions', () => {
  for (const [pattern, kind] of [['検索', 'match-set'], ['.*', 'match-set'], ['(?!)', 'match-set'], ['^' + expected + '$', 'match-set'], ['[', 'invalid-pattern'], [null, 'invalid-pattern'], [Promise.resolve(expected), 'invalid-pattern']]) {
    const report = compareCase(c, expected, pattern, docs);
    assert.equal(report.kind, kind);
    assert.equal(report.input, c.input);
    assert.equal(report.class, c.class);
  }
  const missing = compareCase(c, expected, '検索', docs);
  assert.deepEqual(missing.missing.map((x) => x.document), ['けんさく', 'ケンサク']);
  const extra = compareCase(c, expected, '.*', docs);
  assert.deepEqual(extra.extra.map((x) => x.document), ['', '無関係']);
  const report = compareQueries([c], [{ pattern: expected }], () => { throw new Error('broken'); }, docs, (_, ds) => ds);
  assert.equal(report.mismatches, 1);
  assert.equal(report.failures[0].kind, 'query-error');
  assert.throws(() => compareQueries([], [], () => '', docs, () => docs), /nonempty/);
});

test('CLI succeeds for equivalent regexes, reports mutations, and clears stale success', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'mbmigemo-test-'));
  try {
    const module = join(temporary, 'broken.mjs');
    const report = join(temporary, 'report.json');
    const f = await loadFixtures();
    const patterns = Object.fromEntries(f.manual.map((c, i) => [c.input, f.golden[i].pattern]));
    await writeFile(module, `const patterns = ${JSON.stringify(patterns)}; export async function createMigemo({backend}) { return {backend, query(input) { return '(?:' + patterns[input] + ')'; }}; }\n`);
    const command = [path('scripts/test-compat.mjs'), '--module', module, '--backend', 'both', '--cases', 'manual', '--report', report];
    const success = spawnSync(process.execPath, command, { encoding: 'utf8', timeout: 30_000 });
    assert.equal(success.status, 0, success.stderr);
    const passed = JSON.parse(await readFile(report, 'utf8'));
    assert.equal(passed.status, 'passed');
    assert.deepEqual(passed.results.map((r) => r.backend), ['js', 'wasm-gc']);
    for (const r of passed.results) {
      assert.equal(r.mismatches, 0);
      assert.equal(r.patternDifferences, f.manual.length);
    }
    await writeFile(module, 'export async function createMigemo({backend}) { return {backend, query() { return "(?!)"; }}; }\n');
    const result = spawnSync(process.execPath, [path('scripts/test-compat.mjs'), '--module', module, '--backend', 'js', '--cases', 'manual', '--report', report], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 1, result.stderr);
    const failure = JSON.parse(await readFile(report, 'utf8')).results[0];
    assert.ok(failure.mismatches > 0);
    assert.ok(failure.failures.some((f) => f.missing.some((d) => d.document === '検索')));
    assert.match(result.stdout, new RegExp(`cases=${f.manual.length}, inputs=`));
    await rm(module);
    const missing = spawnSync(process.execPath, command, { encoding: 'utf8', timeout: 5000 });
    assert.equal(missing.status, 1);
    const failed = JSON.parse(await readFile(report, 'utf8'));
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /Cannot load the implementation/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('CLI never turns missing implementation or unknown fixture/backend into a green run', () => {
  for (const args of [['--module', path('.cache/no-such-implementation.mjs')], ['--fixture', 'all'], ['--backend', 'typo'], ['--cases', 'empty'], ['--unknown', 'value']]) {
    const result = spawnSync(process.execPath, [path('scripts/test-compat.mjs'), ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
  }
});
