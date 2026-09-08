import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSKK, practicalLockFile } from '../../scripts/lib/practical-dictionary.mjs';
import { compileDictionary, readCompactDictionary } from '../../scripts/lib/dictionary.mjs';
import { json, path } from '../../scripts/lib/common.mjs';

test('SKK vocabulary policy preserves literals and accounts for every excluded row/value', () => {
  const result = normalizeSKK([
    ';; self-authored SKK sample',
    'はしr /走;annotation/橋/',
    'はし /橋/端/',
    'あ> /亜/阿/',
    '漢字 /除外/',
    '# /#3/番/',
    'てすと /(concat "a")/試験/',
    '_ /　/＿/',
    '#かい /#0回/',
  ].join('\n') + '\n');
  assert.equal(result.source, '#\t番\n_\t　\t＿\nてすと\t試験\nはし\t橋\t端\t走\n');
  assert.deepEqual(result.exclusions, [
    { line: 4, key: 'あ>', reason: 'skk-special-key' },
    { line: 5, key: '漢字', reason: 'compact-reading-range' },
    { line: 9, key: '#かい', reason: 'no-literal-candidates' },
  ]);
  assert.deepEqual(result.statistics, {
    sourceRows: 8, sourceValues: 14, commentRows: 1,
    specialKeyRows: 1, specialKeyValues: 2,
    unsupportedReadingRows: 1, unsupportedReadingValues: 1,
    emptyRows: 1, okuriRows: 1, annotationValues: 1, numericTemplateValues: 2,
    lispValues: 1, duplicateValues: 1, acceptedRows: 5, readings: 4, values: 7,
  });
  const compact = readCompactDictionary(compileDictionary(result.source));
  assert.deepEqual([...compact.search('はし')].sort(), ['橋', '端', '走']);
  assert.deepEqual([...compact.search('_')].sort(), ['　', '＿']);
});

test('SKK vocabulary merging is independent of source row/candidate order', () => {
  const rows = ['あr /亜/阿/', 'あ /阿/唖/', 'abc /B/A/', 'か /科/'];
  const forward = normalizeSKK(rows.join('\n') + '\n');
  const reversed = normalizeSKK(rows.toReversed().join('\n') + '\n');
  assert.equal(forward.source, reversed.source);
  assert.deepEqual(compileDictionary(forward.source), compileDictionary(reversed.source));
});

test('SKK malformed input fails closed instead of silently dropping rows', () => {
  for (const invalid of ['', 'あ /亜/', 'あ /亜/\r\n', 'あ /亜\0/\n', 'broken\n', 'あ 亜\n', 'あ //\n', 'あ /亜\t阿/\n', '; comments only\n']) {
    assert.throws(() => normalizeSKK(invalid), undefined, JSON.stringify(invalid));
  }
});

test('pinned practical corpus accounting balances without candidate truncation', async () => {
  const lock = await json(path(practicalLockFile));
  const s = lock.statistics;
  assert.equal(s.sourceRows, s.specialKeyRows + s.unsupportedReadingRows + s.emptyRows + s.acceptedRows);
  assert.equal(s.sourceValues, s.specialKeyValues + s.unsupportedReadingValues + s.numericTemplateValues + s.lispValues + s.duplicateValues + s.values);
  assert.ok(s.readings > 100_000);
  assert.ok(s.values > 200_000);
  assert.equal(lock.license, 'GPL-2.0-or-later');
  assert.ok(lock.sources.some((entry) => entry.file === 'COPYING'));
  for (const hash of [lock.output.sourceSha256, lock.output.sha256, lock.output.exclusionsSha256, ...lock.sources.map((entry) => entry.sha256)]) {
    assert.match(hash, /^[a-f0-9]{64}$/u);
  }
});
