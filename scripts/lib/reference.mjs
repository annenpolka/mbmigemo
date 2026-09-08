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
  if (!['tiny', 'alternate'].includes(fixture)) throw new Error(`unsupported reference fixture: ${fixture}`);
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
  const output = run(`${directory}/cmigemo-driver`, [
    path(`tests/fixtures/${fixture === 'tiny' ? 'tiny' : 'alternate'}-dict.tsv`),
    ...lock.tables.map((name) => `${directory}/${name}`),
  ], { input: inputs.map((s) => Buffer.from(s, 'utf8').toString('hex') + '\n').join('') });
  if (!output.endsWith('\n')) throw new Error('reference output is incomplete');
  const lines = output.slice(0, -1).split('\n');
  if (lines.length !== inputs.length) throw new Error(`reference output count: ${lines.length} != ${inputs.length}`);
  return lines.map((line, i) => {
    if (!/^(?:[a-f0-9]{2})*$/.test(line)) throw new Error(`invalid reference output at ${i}`);
    const rawPattern = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(line, 'hex'));
    const pattern = adaptPattern(rawPattern);
    try { new RegExp(pattern, lock.flags); }
    catch (error) { throw new Error(`invalid reference regex for ${JSON.stringify(inputs[i])}: ${pattern}`, { cause: error }); }
    return { pattern, rawPattern };
  });
}
