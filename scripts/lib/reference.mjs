import { readFile } from 'node:fs/promises';
import { path, json, run, verifyHash } from './common.mjs';

export function adaptPattern(raw) {
  // Walk escape tokens, so an escaped backslash followed by '-' stays intact.
  let result = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && i + 1 < raw.length) {
      const next = raw[++i];
      result += next === '-' ? '\\x2d' : '\\' + next;
    } else result += raw[i];
  }
  return result;
}

export async function referencePatterns(inputs, fixture = 'tiny') {
  if (!['tiny', 'alternate', 'practical'].includes(fixture)) throw new Error(`unsupported reference fixture: ${fixture}`);
  if (!inputs.length) throw new Error('reference inputs must not be empty');
  for (const input of inputs) {
    if (typeof input !== 'string' || input === '' || input.includes('\0') || !input.isWellFormed()) {
      throw new Error('C oracle requires nonempty, well-formed Unicode without NUL; use mbmigemo contracts for these cases');
    }
  }
  const directory = path('.cache/reference');
  let receipt;
  try { receipt = await json(`${directory}/receipt.json`); }
  catch (error) { throw new Error('C/Migemo is not prepared: run npm run reference:prepare', { cause: error }); }
  verifyHash(await readFile(path('tests/reference/lock.json')), receipt.lockSha256, 'reference lock');
  verifyHash(await readFile(path('tests/reference/cmigemo-driver.c')), receipt.driverSha256, 'reference driver source');
  const lock = await json(path('tests/reference/lock.json'));
  for (const file of ['cmigemo-driver', ...lock.tables]) {
    verifyHash(await readFile(`${directory}/${file}`), receipt.files[file], `reference ${file}`);
  }
  let source;
  if (fixture === 'practical') {
    const { loadPracticalDictionaryMetadata } = await import('./practical-dictionary.mjs');
    source = path((await loadPracticalDictionaryMetadata()).source);
  } else {
    source = path(`tests/fixtures/${fixture}-dict.tsv`);
  }
  const patterns = [];
  // Real dictionaries can produce large prefix patterns. Keep each C process's
  // framed output bounded while still querying every supplied input.
  const batchSize = fixture === 'practical' ? 256 : inputs.length;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let start = 0; start < inputs.length; start += batchSize) {
    const batch = inputs.slice(start, start + batchSize);
    const output = run(`${directory}/cmigemo-driver`, [source, ...lock.tables.map((name) => `${directory}/${name}`)], {
      input: batch.map((s) => Buffer.from(s, 'utf8').toString('hex') + '\n').join(''),
    });
    if (!output.endsWith('\n')) throw new Error('reference output is incomplete');
    const lines = output.slice(0, -1).split('\n');
    if (lines.length !== batch.length) throw new Error(`reference output count: ${lines.length} != ${batch.length}`);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/^(?:[a-f0-9]{2})*$/.test(line)) throw new Error(`invalid reference output at ${start + i}`);
      const rawPattern = decoder.decode(Buffer.from(line, 'hex'));
      const pattern = adaptPattern(rawPattern);
      try { new RegExp(pattern, lock.flags); }
      catch (error) { throw new Error(`invalid reference regex for ${JSON.stringify(batch[i])}: ${pattern}`, { cause: error }); }
      patterns.push({ pattern, rawPattern });
    }
  }
  return patterns;
}
