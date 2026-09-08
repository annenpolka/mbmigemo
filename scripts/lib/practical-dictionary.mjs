import { readFile } from 'node:fs/promises';
import { path, json, sha256, verifyHash, atomicWrite, encodeJSON } from './common.mjs';

export const practicalDirectory = '.cache/dictionaries/practical';
export const practicalLockFile = 'tests/dictionaries/practical.lock.json';

function compactReading(key) {
  return [...key].every((c) => {
    const code = c.codePointAt(0);
    return (code >= 32 && code <= 126) || (code >= 0x3041 && code <= 0x3096) || code === 0x30fc;
  });
}

// The vocabulary policy follows C/Migemo's pinned skk2migemo.pl: remove
// annotations/okuri markers, and omit SKK special keys and executable/numeric
// templates. Merge duplicate readings before feeding either implementation.
// Compact-format exclusions are recorded in full, never delegated to its builder.
export function normalizeSKK(source) {
  if (!source.endsWith('\n') || /[\r\0]/.test(source)) throw new Error('SKK source must be LF-terminated text without CR/NUL');
  const entries = new Map();
  const exclusions = [];
  const statistics = {
    sourceRows: 0, sourceValues: 0, commentRows: 0,
    specialKeyRows: 0, specialKeyValues: 0,
    unsupportedReadingRows: 0, unsupportedReadingValues: 0,
    emptyRows: 0, okuriRows: 0, annotationValues: 0, numericTemplateValues: 0,
    lispValues: 0, duplicateValues: 0, acceptedRows: 0, readings: 0, values: 0,
  };
  const lines = source.slice(0, -1).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(';')) { statistics.commentRows++; continue; }
    const match = /^([^ ]+) +(\/.*\/)$/u.exec(line);
    if (!match) throw new Error(`malformed SKK row at line ${i + 1}`);
    statistics.sourceRows++;
    const rawValues = match[2].slice(1, -1).split('/');
    statistics.sourceValues += rawValues.length;
    let key = match[1];
    if (/^[<>?]|[<>?]$/u.test(key)) {
      statistics.specialKeyRows++;
      statistics.specialKeyValues += rawValues.length;
      exclusions.push({ line: i + 1, key, reason: 'skk-special-key' });
      continue;
    }
    const hasNumber = key.includes('#');
    if (/[a-z]$/u.test(key) && !/^[ -~]+$/u.test(key)) {
      key = key.slice(0, -1);
      statistics.okuriRows++;
    }
    if (!compactReading(key)) {
      statistics.unsupportedReadingRows++;
      statistics.unsupportedReadingValues += rawValues.length;
      exclusions.push({ line: i + 1, key, reason: 'compact-reading-range' });
      continue;
    }
    const values = [];
    // SKK's delimiter is '/', not whitespace. In particular U+3000 is a
    // legitimate candidate for '_' and must survive into both dictionaries.
    for (const raw of rawValues) {
      if (raw.includes(';')) statistics.annotationValues++;
      const value = raw.replace(/;.*$/u, '');
      if (hasNumber && value.includes('#')) { statistics.numericTemplateValues++; continue; }
      if (/^\([a-zA-Z].*\)$/u.test(value)) { statistics.lispValues++; continue; }
      if (!value || /[\t\r\n\0]/u.test(value)) throw new Error(`invalid SKK candidate at line ${i + 1}`);
      values.push(value);
    }
    if (!key || !values.length) {
      statistics.emptyRows++;
      exclusions.push({ line: i + 1, key, reason: 'no-literal-candidates' });
      continue;
    }
    statistics.acceptedRows++;
    const merged = entries.get(key) ?? new Set();
    for (const value of values) {
      if (merged.has(value)) statistics.duplicateValues++;
      merged.add(value);
    }
    entries.set(key, merged);
  }
  const rows = [...entries.keys()].sort().map((key) => {
    const values = [...entries.get(key)].sort();
    statistics.values += values.length;
    return [key, ...values].join('\t');
  });
  statistics.readings = rows.length;
  if (!rows.length) throw new Error('SKK vocabulary is empty');
  return { source: rows.join('\n') + '\n', statistics, exclusions };
}

async function verifiedDownload(entry) {
  const output = path(practicalDirectory, 'upstream', entry.file);
  if (entry.bundledFile) {
    const bytes = await readFile(path(entry.bundledFile));
    verifyHash(bytes, entry.sha256, entry.file);
    await atomicWrite(output, bytes);
    return bytes;
  }
  let bytes;
  try { bytes = await readFile(output); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${entry.file} download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    verifyHash(bytes, entry.sha256, entry.file);
    await atomicWrite(output, bytes);
  }
  verifyHash(bytes, entry.sha256, entry.file);
  return bytes;
}

export async function preparePracticalDictionary(compileDictionary) {
  const lockBytes = await readFile(path(practicalLockFile));
  const lock = JSON.parse(lockBytes);
  const sources = await Promise.all(lock.sources.map(verifiedDownload));
  const source = new TextDecoder(lock.encoding, { fatal: true }).decode(sources[0]);
  const normalized = normalizeSKK(source);
  const tsv = Buffer.from(normalized.source);
  verifyHash(tsv, lock.output.sourceSha256, 'practical vocabulary');
  if (JSON.stringify(normalized.statistics) !== JSON.stringify(lock.statistics)) throw new Error('practical vocabulary counts changed');
  const exclusions = Buffer.from(encodeJSON(normalized.exclusions));
  verifyHash(exclusions, lock.output.exclusionsSha256, 'practical exclusions');
  const bytes = compileDictionary(normalized.source);
  verifyHash(bytes, lock.output.sha256, 'practical compact dictionary');
  const metadata = {
    source: `${practicalDirectory}/practical.tsv`, file: `${practicalDirectory}/practical.compact`,
    ...lock.output, statistics: normalized.statistics,
  };
  await atomicWrite(path(metadata.source), tsv);
  await atomicWrite(path(metadata.file), bytes);
  await atomicWrite(path(practicalDirectory, 'exclusions.json'), exclusions);
  await atomicWrite(path(practicalDirectory, 'NOTICE.txt'),
    `SKK-JISYO.L ${lock.commit}\nLicense: ${lock.license}\nSource: ${lock.sources[0].url}\n` +
    'The original dictionary and copyright notices are preserved in upstream/SKK-JISYO.L.\n' +
    'The license text is upstream/COPYING. Regenerate using npm run dictionary:prepare -- --fixture practical.\n' +
    'The derived TSV merges readings, removes SKK annotations and templates, and excludes compact-unsupported readings.\n' +
    'The complete exclusions and counts are in exclusions.json and receipt.json.\n');
  await atomicWrite(path(practicalDirectory, 'receipt.json'), encodeJSON({
    schemaVersion: 1, lockSha256: sha256(lockBytes), converter: lock.converter,
    license: lock.license, commit: lock.commit, ...metadata,
  }));
  return metadata;
}

export async function loadPracticalDictionaryMetadata() {
  const lockBytes = await readFile(path(practicalLockFile));
  const lock = JSON.parse(lockBytes);
  let receipt;
  try { receipt = await json(path(practicalDirectory, 'receipt.json')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('Practical dictionary is not prepared. Run npm run dictionary:prepare -- --fixture practical.');
  }
  if (receipt.lockSha256 !== sha256(lockBytes)) throw new Error('practical dictionary receipt does not match lock');
  const source = `${practicalDirectory}/practical.tsv`;
  const file = `${practicalDirectory}/practical.compact`;
  verifyHash(await readFile(path(source)), lock.output.sourceSha256, 'practical vocabulary');
  verifyHash(await readFile(path(file)), lock.output.sha256, 'practical compact dictionary');
  return { source, file, ...lock.output, statistics: lock.statistics };
}
