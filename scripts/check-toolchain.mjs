import { readFile } from 'node:fs/promises';
import { toolchainEnv } from './lib/toolchain.mjs';
import { path, json, run } from './lib/common.mjs';

const pkg = await json(path('package.json'));
if (process.versions.node !== pkg.engines.node) throw new Error(`Use Node.js ${pkg.engines.node}; got ${process.versions.node}`);
if (run('npm', ['--version']).trim() !== pkg.engines.npm) throw new Error(`Use npm ${pkg.engines.npm}`);
if (process.argv.includes('--moon')) {
  const pin = await json(path('tests/moon/toolchain.json'));
  const env = toolchainEnv();
  const moon = run('moon', ['version'], { env }).split('\n')[0];
  const compiler = run('moonc', ['-v'], { env }).trim();
  if (moon !== pin.moon || compiler !== pin.moonc) throw new Error(`MoonBit toolchain differs from tests/moon/toolchain.json. Revalidate before changing the pin.\n${moon}\n${compiler}`);
  const coreSource = await readFile(`${env.MOON_HOME}/lib/core/moon.mod`, 'utf8');
  const coreVersion = coreSource.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (coreVersion !== pin.core) throw new Error(`MoonBit core differs from the compiler pin: ${coreVersion}`);
  const lock = await json(path('tests/moon/toolchain-lock.json'));
  if (JSON.stringify(lock.versions) !== JSON.stringify(pin)) throw new Error('MoonBit runtime and restoration pins differ');
}
