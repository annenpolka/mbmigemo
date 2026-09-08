import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { path } from '../../scripts/lib/common.mjs';
import { loadDictionary } from '../../scripts/lib/dictionary.mjs';
import { createMigemo } from '../../packages/mbmigemo/dist/index.js';

// Separate processes avoid module caches masking an unwanted backend load.
async function sandbox(body, missing = []) {
  const directory = await mkdtemp(join(tmpdir(), 'mbmigemo-backend-'));
  try {
    await cp(path('packages/mbmigemo/dist'), directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    for (const name of missing) await rm(join(directory, name));
    const fixture = JSON.stringify([...await loadDictionary()]);
    const source = `import assert from 'node:assert/strict';\nconst dictionary = new Uint8Array(${fixture});\n${body}`;
    const file = join(directory, 'check.mjs');
    await writeFile(file, source);
    const result = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr + result.stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('explicit/default JS works without Wasm artifacts or WebAssembly', async () => {
  await sandbox(`
    globalThis.WebAssembly = undefined;
    const { createMigemo } = await import('./index.js');
    for (const backend of [undefined, 'js']) {
      const instance = await createMigemo({ dictionary, backend });
      assert.equal(instance.backend, 'js');
      assert.ok(new RegExp(instance.query('kensaku'), 'u').test('検索'));
    }
  `, ['core.wasm', 'feature-bytes.js']);
});

test('auto falls back only on feature unavailability; explicit Wasm rejects', async () => {
  await sandbox(`
    globalThis.WebAssembly = undefined;
    const { createMigemo } = await import('./index.js');
    assert.equal((await createMigemo({ dictionary, backend: 'auto' })).backend, 'js');
    await assert.rejects(createMigemo({ dictionary, backend: 'wasm-gc' }), { code: 'UnsupportedBackend' });
    await assert.rejects(createMigemo({ dictionary: dictionary.subarray(0, 12), backend: 'auto' }), { code: 'InvalidDictionary' });
  `, ['core.wasm']);
});

test('Wasm and supported auto do not load JS core', async () => {
  await sandbox(`
    const { createMigemo } = await import('./index.js');
    for (const backend of ['wasm-gc', 'auto']) {
      const instance = await createMigemo({ dictionary, backend });
      assert.equal(instance.backend, 'wasm-gc');
      assert.ok(new RegExp(instance.query('kensaku'), 'u').test('検索'));
    }
  `, ['core.js']);
});

test('auto exposes core loading errors instead of falling back', async () => {
  await sandbox(`
    const { createMigemo } = await import('./index.js');
    await assert.rejects(createMigemo({ dictionary, backend: 'auto' }), error =>
      error.code === 'InitializationFailed' && error.cause.code === 'ENOENT');
  `, ['core.wasm']);
});

test('auto reports invalid dictionaries on its selected Wasm backend', async () => {
  await assert.rejects(createMigemo({ dictionary: new Uint8Array(8), backend: 'auto' }), { code: 'InvalidDictionary' });
});

test('unknown backend and invalid runtime arguments have explicit failures', async () => {
  await assert.rejects(createMigemo({ dictionary: await loadDictionary(), backend: 'native' }), { code: 'UnsupportedBackend' });
  for (const dictionary of [null, [], new ArrayBuffer(8)]) {
    await assert.rejects(createMigemo({ dictionary }), { code: 'InvalidDictionary' });
  }
  const instance = await createMigemo({ dictionary: await loadDictionary() });
  assert.throws(() => instance.query(null), TypeError);
});

test('initialization snapshots a view before async module loading', async () => {
  for (const backend of ['js', 'wasm-gc']) {
    const dictionary = await loadDictionary();
    const initialized = createMigemo({ dictionary, backend });
    dictionary.fill(0);
    const instance = await initialized;
    assert.ok(Object.isFrozen(instance));
    assert.ok(new RegExp(instance.query('kensaku'), 'u').test('検索'));
  }
});
