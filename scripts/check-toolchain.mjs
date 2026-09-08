import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { path, json, run } from './lib/common.mjs';

const pkg = await json(path('package.json'));
if (process.versions.node !== pkg.engines.node) throw new Error(`Use Node.js ${pkg.engines.node}; got ${process.versions.node}`);
if (run('npm', ['--version']).trim() !== pkg.engines.npm) throw new Error(`Use npm ${pkg.engines.npm}`);
if (process.argv.includes('--moon')) {
  const pin = await json(path('tests/moon/toolchain.json'));
  const moon = run('moon', ['version']).split('\n')[0];
  const compiler = run('moonc', ['-v']).trim();
  if (moon !== pin.moon || compiler !== pin.moonc) throw new Error(`MoonBit toolchain differs from tests/moon/toolchain.json. Revalidate before changing the pin.\n${moon}\n${compiler}`);
  const coreFile = `${process.env.MOON_HOME ?? `${homedir()}/.moon`}/lib/core/moon.mod.json`;
  const core = JSON.parse(await readFile(coreFile, 'utf8'));
  if (core.version !== pin.core) throw new Error(`MoonBit core differs from the compiler pin: ${core.version}`);
}
