import { toolchainEnv } from './lib/toolchain.mjs';
import { path, run } from './lib/common.mjs';

run(process.execPath, [path('scripts/check-toolchain.mjs'), '--moon']);
for (const target of ['js', 'wasm-gc']) {
  run('moon', ['check', '--target', target, '--deny-warn'], { env: toolchainEnv() });
  run('moon', ['build', '--release', '--target', target, '--deny-warn'], { env: toolchainEnv() });
  console.log(`Built ${target} bridge probe in ${path('_build', target, 'release/build/bridge')}`);
}
