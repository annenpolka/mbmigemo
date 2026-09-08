import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { path, json } from '../../scripts/lib/common.mjs';
import { loadFixtures } from '../../scripts/lib/fixtures.mjs';
import { referencePatterns, adaptPattern } from '../../scripts/lib/reference.mjs';
import { documentsFor } from '../../scripts/lib/corpus.mjs';

test('pinned C/Migemo still produces the recorded golden patterns and match sets', async () => {
  const f = await loadFixtures();
  const actual = await referencePatterns(f.manual.map((c) => c.input));
  for (let i = 0; i < f.manual.length; i++) {
    const c = f.manual[i], expected = f.golden[i];
    assert.equal(c.id, expected.id);
    assert.equal(actual[i].rawPattern, expected.rawPattern, c.id);
    assert.equal(actual[i].pattern, expected.pattern, c.id);
    const re = new RegExp(actual[i].pattern, 'u');
    assert.deepEqual(documentsFor(c, f.documents).flatMap((doc, index) => re.test(doc) ? [index] : []), expected.matched, c.id);
  }
});

test('10,000 generated inputs have valid regexes and nonempty positive and negative probes', async () => {
  const f = await loadFixtures();
  const patterns = await referencePatterns(f.generated.map((c) => c.input));
  for (let i = 0; i < f.generated.length; i++) {
    const re = new RegExp(patterns[i].pattern, 'u');
    const docs = documentsFor(f.generated[i], f.documents);
    assert.ok(docs.some((d) => re.test(d)), f.generated[i].id);
    assert.ok(docs.some((d) => !re.test(d)), f.generated[i].id);
  }
});

test('independent acceptance examples verify the reference configuration', async () => {
  const [kensaku, nn, space, meta] = await referencePatterns(['kensaku', 'nn', ' ', 'meta']);
  const re = new RegExp(kensaku.pattern, 'u');
  for (const doc of ['検索', 'けんさく', 'ケンサク', 'ｹﾝｻｸ', '前検索後']) assert.ok(re.test(doc), doc);
  for (const doc of ['', '無関係', '日本語']) assert.ok(!re.test(doc), doc);
  assert.ok(new RegExp(nn.pattern, 'u').test('ん'));
  assert.ok(!new RegExp(space.pattern, 'u').test(''));
  const literal = new RegExp(meta.pattern, 'u');
  for (const doc of ['(a|b)', '[x]', 'a.b', 'a+b', '^$\\{}']) assert.ok(literal.test(doc), doc);
  for (const doc of ['axb', 'aaab', 'x']) assert.ok(!literal.test(doc), doc);
});

test('hyphen adaptation preserves escaped-backslash boundaries and literals', () => {
  for (const [raw, expected, positive] of [
    ['a\\-b', 'a\\x2db', 'a-b'], ['[\\-ー]', '[\\x2dー]', '-'],
    ['\\\\-', '\\\\-', '\\-'], ['\\\\\\-', '\\\\\\x2d', '\\-'],
  ]) {
    assert.equal(adaptPattern(raw), expected);
    assert.ok(new RegExp(expected, 'u').test(positive));
  }
});

test('oracle rejects unsupported inputs instead of trimming or truncating them', async () => {
  for (const inputs of [[], [''], ['a\0b'], ['\ud800']]) await assert.rejects(referencePatterns(inputs));
  const inputs = ['x'.repeat(1024), 'a\nb', 'kensaku', 'nihongo', 'kensaku'];
  const result = await referencePatterns(inputs);
  for (let i = 0; i < 2; i++) assert.ok(new RegExp(`^(?:${result[i].pattern})$`, 'u').test(inputs[i]));
  assert.equal(result[2].pattern, result[4].pattern);
});

test('missing conversion tables and broken driver framing fail visibly', async () => {
  const lock = await json(path('tests/reference/lock.json'));
  const args = [path('tests/fixtures/tiny-dict.tsv'), ...lock.tables.map((name) => path('.cache/reference', name))];
  const binary = path('.cache/reference/cmigemo-driver');
  const missing = spawnSync(binary, [args[0], path('.cache/no-such-table'), ...args.slice(2)], { encoding: 'utf8', timeout: 5000 });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot load/);
  for (const input of ['0\n', 'zz\n', '00\n', '\n']) {
    const result = spawnSync(binary, args, { input, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /protocol/);
  }
});
