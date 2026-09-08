import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite, encodeJSON, json, path, run, sha256, verifyHash } from './lib/common.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--print-home')) {
  throw new Error('Usage: node scripts/prepare-toolchain.mjs [--print-home]');
}
const lockFile = path('tests/moon/toolchain-lock.json');
const lock = await json(lockFile);
const platform = `${process.platform}-${process.arch}`;
const binary = lock.platforms[platform];
if (lock.schemaVersion !== 1 || !binary) throw new Error(`Unsupported MoonBit SDK platform: ${platform}`);
const output = path('.cache/toolchain', lock.release, platform);

async function archive(entry) {
  const file = path('.cache/toolchain/archives', `${entry.sha256}.tar.gz`);
  let bytes;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.error(`Downloading ${entry.url}`);
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`MoonBit SDK download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    verifyHash(bytes, entry.sha256, entry.url);
    await atomicWrite(file, bytes);
  }
  // A damaged cache must fail visibly instead of falling back to an unpinned SDK.
  verifyHash(bytes, entry.sha256, file);
  return file;
}

// Keep the global SDK untouched. Recreate from verified archives each time so
// modifications to previously extracted binaries/core cannot affect this build.
const binaryArchive = await archive(binary);
const coreArchive = await archive(lock.core);
await mkdir(path('.cache/toolchain'), { recursive: true });
const temporary = await mkdtemp(path('.cache/toolchain/prepare-'));
try {
  run('tar', ['-xzf', binaryArchive, '-C', temporary]);
  run('tar', ['-xzf', coreArchive, '-C', join(temporary, 'lib')]);
  // Upstream ships non-executable files; its official installer sets these bits.
  for (const file of await readdir(join(temporary, 'bin'), { withFileTypes: true })) {
    if (file.isFile()) await chmod(join(temporary, 'bin', file.name), 0o755);
  }
  await chmod(join(temporary, 'bin/internal/tcc'), 0o755);
  const env = { ...process.env, MOON_HOME: temporary, PATH: `${join(temporary, 'bin')}:${process.env.PATH}` };
  const moon = join(temporary, 'bin/moon');
  const moonc = join(temporary, 'bin/moonc');
  const actual = {
    moon: run(moon, ['version'], { env }).split('\n')[0],
    moonc: run(moonc, ['-v'], { env }).trim(),
    core: (await readFile(join(temporary, 'lib/core/moon.mod'), 'utf8')).match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1],
  };
  for (const name of Object.keys(lock.versions)) {
    if (actual[name] !== lock.versions[name]) throw new Error(`Restored MoonBit ${name} mismatch: ${actual[name]}`);
  }
  console.error(`Bundling MoonBit ${lock.release} core for ${platform}`);
  run(moon, ['-C', join(temporary, 'lib/core'), 'bundle', '--warn-list', '-a', '--all'], { env });
  run(moon, ['-C', join(temporary, 'lib/core'), 'bundle', '--warn-list', '-a', '--target', 'wasm-gc', '--quiet'], { env });
  await atomicWrite(join(temporary, 'receipt.json'), encodeJSON({
    lockSha256: sha256(await readFile(lockFile)), platform, versions: actual,
    binaryArchiveSha256: binary.sha256, coreArchiveSha256: lock.core.sha256,
  }));
  await mkdir(path('.cache/toolchain', lock.release), { recursive: true });
  await rm(output, { recursive: true, force: true });
  await rename(temporary, output);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.error(`MoonBit ${lock.release} restored and checked at ${output}`);
if (args[0] === '--print-home') console.log(output);
