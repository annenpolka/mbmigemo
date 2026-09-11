import { toolchainEnv } from './lib/toolchain.mjs';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { path, run } from './lib/common.mjs';

run(process.execPath, [path('scripts/check-toolchain.mjs'), '--moon']);
for (const target of ['js', 'wasm-gc']) {
  run('moon', ['check', '--target', target, '--deny-warn'], { env: toolchainEnv() });
  run('moon', ['build', '--release', '--target', target, '--deny-warn'], { env: toolchainEnv() });
}
const output = path('packages/mbmigemo/dist');
await mkdir(output, { recursive: true });
run(path('node_modules/.bin/tsc'), ['--project', 'packages/mbmigemo/tsconfig.json']);
await copyFile(path('_build/js/release/build/exports/exports.js'), `${output}/core.js`);
await copyFile(path('_build/wasm-gc/release/build/exports/exports.wasm'), `${output}/core.wasm`);
const probe = await readFile(path('_build/wasm-gc/release/build/features/features.wasm'));
await writeFile(`${output}/feature-bytes.js`, `// Generated from src/features; do not edit.\nexport const featureBytes = new Uint8Array(${JSON.stringify([...probe])});\n`);
await copyFile(path('LICENSE'), path('packages/mbmigemo/LICENSE'));
await copyFile(path('src/romaji/LICENSE-CMIGEMO'), `${output}/LICENSE-CMIGEMO`);
await copyFile(`${toolchainEnv().MOON_HOME}/lib/core/LICENSE`, `${output}/LICENSE-MOONBIT-CORE`);
await copyFile(`${toolchainEnv().MOON_HOME}/lib/core/NOTICE`, `${output}/NOTICE-MOONBIT-CORE`);
console.log('Built MoonBit JS/Wasm GC cores and typed ESM API in packages/mbmigemo/dist');
