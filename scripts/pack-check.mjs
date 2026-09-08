import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { path, run, atomicWrite, encodeJSON } from './lib/common.mjs';
import { loadDictionary } from './lib/dictionary.mjs';

const destination = path('.cache/pack');
await mkdir(destination, { recursive: true });
const [packed] = JSON.parse(run('npm', ['--cache', path('.cache/npm-pack'), 'pack', '--json', '--ignore-scripts', '--pack-destination', destination], {
  cwd: path('packages/mbmigemo'),
}));
const names = new Set(packed.files.map(({ path }) => path));
for (const file of ['dist/index.js', 'dist/index.d.ts', 'dist/core.js', 'dist/core.wasm', 'dist/feature-bytes.js',
  'dist/LICENSE-CMIGEMO', 'dist/LICENSE-MOONBIT-CORE', 'dist/NOTICE-MOONBIT-CORE', 'THIRD_PARTY_NOTICES.md']) {
  assert.ok(names.has(file), `Missing packed artifact: ${file}`);
}
for (const file of names) assert.ok(!file.includes('node_modules/') && !file.startsWith('tests/'), file);

const consumer = await mkdtemp(join(tmpdir(), 'mbmigemo-consumer-'));
try {
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline', '--cache', path('.cache/npm-pack'), join(destination, packed.filename)], { cwd: consumer });
  const dictionary = [...await loadDictionary()];
  await writeFile(join(consumer, 'check.ts'), `
import { createMigemo, MigemoError, type Migemo, type Backend } from 'mbmigemo';
const backends: Backend[] = ['js', 'wasm-gc', 'auto'];
for (const backend of backends) {
  const dictionary = new Uint8Array(${JSON.stringify(dictionary)});
  const instance: Migemo = await createMigemo({ dictionary, backend });
  dictionary.fill(0);
  if (instance.backend !== (backend === 'auto' ? 'wasm-gc' : backend)) throw new Error('wrong backend');
  for (const [query, text] of [['kensaku', '検索'], ['yoshi', '𠮷'], ['emoji', '😀']]) {
    if (!new RegExp(instance.query(query), 'u').test(text)) throw new Error('search failed');
  }
  if (instance.query('') !== '(?!)') throw new Error('empty query contract');
}
try { await createMigemo({dictionary: new Uint8Array()}); throw new Error('accepted invalid dictionary'); }
catch (error) { if (!(error instanceof MigemoError) || error.code !== 'InvalidDictionary') throw error; }
`);
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', strict: true, types: [], outDir: 'out',
  }, include: ['check.ts'] }));
  run(path('node_modules/.bin/tsc'), ['--project', join(consumer, 'tsconfig.json')]);
  run(process.execPath, [join(consumer, 'out/check.js')], { cwd: consumer });
  await atomicWrite(path('test-results/pack.json'), encodeJSON({ status: 'passed', filename: packed.filename, integrity: packed.integrity, files: [...names], backends: ['js', 'wasm-gc', 'auto'] }));
  console.log('Packed package passed typed consumer searches on js, wasm-gc, and auto (no publication).');
} finally {
  await rm(consumer, { recursive: true, force: true });
}
