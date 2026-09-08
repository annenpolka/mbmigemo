import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const path = (...parts) => resolve(root, ...parts);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const encodeJSON = (value) => JSON.stringify(value, null, 2) + '\n';

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status ?? result.signal}):\n${result.stderr ?? ''}\n${result.stdout ?? ''}`);
  }
  return result.stdout;
}

export function verifyHash(bytes, expected, label) {
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${label}: SHA-256 mismatch; expected ${expected}, got ${actual}`);
}

export async function atomicWrite(file, bytes) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function options(args, allowed) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.includes(key) || key in result) throw new Error(`unknown or duplicate option: ${key}`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`missing value for ${key}`);
    result[key] = args[++i];
  }
  return result;
}
