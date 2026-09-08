import { spawnSync } from 'node:child_process';
import { toolchainEnv } from './lib/toolchain.mjs';
const result = spawnSync('moon', process.argv.slice(2), { env: toolchainEnv(), stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
