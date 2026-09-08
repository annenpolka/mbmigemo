import { existsSync, readFileSync } from 'node:fs';
import { delimiter } from 'node:path';
import { path } from './common.mjs';

/** All builds select the restored, pinned SDK, independently of the user's PATH. */
export function toolchainEnv() {
  const pin = JSON.parse(readFileSync(path('tests/moon/toolchain.json'), 'utf8'));
  const home = path('.cache/toolchain', pin.core, `${process.platform}-${process.arch}`);
  if (!existsSync(`${home}/bin/moon`)) throw new Error('Pinned MoonBit SDK is missing. Run npm run toolchain:prepare.');
  return { ...process.env, MOON_HOME: home, PATH: `${home}/bin${delimiter}${process.env.PATH ?? ''}` };
}
