import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { path } from '../../scripts/lib/common.mjs';
import { loadDictionary } from '../../scripts/lib/dictionary.mjs';
import { createMigemo } from '../../packages/mbmigemo/dist/index.js';

// Each fault runs against a disposable package so module caches and damaged
// artifacts cannot leak into other contracts or hide whether recovery works.
async function withPackageFault(source) {
  const directory = await mkdtemp(join(tmpdir(), 'mbmigemo-backend-error-'));
  try {
    await cp(path('packages/mbmigemo/dist'), directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    const fixture = JSON.stringify([...await loadDictionary()]);
    const file = join(directory, 'fault.mjs');
    await writeFile(file, `
      import assert from 'node:assert/strict';
      import { readFile, writeFile, rm } from 'node:fs/promises';
      const dictionary = new Uint8Array(${fixture});
      ${source}
    `);
    const result = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr + result.stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('detached and out-of-bounds dictionary views report InvalidDictionary', async () => {
  const detached = new Uint8Array(8);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  const resizable = new ArrayBuffer(8, { maxByteLength: 16 });
  const outOfBounds = new Uint8Array(resizable, 4, 4);
  resizable.resize(2);
  for (const dictionary of [detached, outOfBounds]) {
    for (const backend of ['js', 'wasm-gc', 'auto']) {
      await assert.rejects(createMigemo({ dictionary, backend }), { code: 'InvalidDictionary' });
    }
  }
});

test('corrupt Wasm core rejects concurrent callers and a repaired artifact can retry', async () => {
  await withPackageFault(`
    const url = new URL('./core.wasm', import.meta.url);
    const original = await readFile(url);
    await writeFile(url, new Uint8Array([0, 97, 115]));
    const { createMigemo } = await import('./index.js');
    const attempts = await Promise.allSettled(['auto', 'wasm-gc'].map(backend =>
      createMigemo({ dictionary, backend })));
    for (const attempt of attempts) {
      assert.equal(attempt.status, 'rejected');
      assert.equal(attempt.reason.code, 'InitializationFailed');
      assert.ok(attempt.reason.cause instanceof WebAssembly.CompileError);
    }
    await writeFile(url, original);
    for (const backend of ['auto', 'wasm-gc']) {
      const instance = await createMigemo({ dictionary, backend });
      assert.equal(instance.backend, 'wasm-gc');
      assert.ok(new RegExp(instance.query('kensaku'), 'u').test('検索'));
    }
  `);
});

test('a missing feature probe is an initialization failure while explicit JS still works', async () => {
  await withPackageFault(`
    await rm(new URL('./feature-bytes.js', import.meta.url));
    const { createMigemo } = await import('./index.js');
    for (const backend of ['auto', 'wasm-gc']) {
      await assert.rejects(createMigemo({ dictionary, backend }), error =>
        error.code === 'InitializationFailed' && error.cause.code === 'ERR_MODULE_NOT_FOUND');
    }
    assert.equal((await createMigemo({ dictionary, backend: 'js' })).backend, 'js');
  `);
});

test('unsupported Wasm features fall back, but runtime traps remain initialization failures', async () => {
  await withPackageFault(`
    const { createMigemo } = await import('./index.js');
    for (const ErrorType of [WebAssembly.CompileError, WebAssembly.LinkError, TypeError]) {
      WebAssembly.instantiate = async () => { throw new ErrorType('unsupported feature sentinel'); };
      assert.equal((await createMigemo({ dictionary, backend: 'auto' })).backend, 'js');
      await assert.rejects(createMigemo({ dictionary, backend: 'wasm-gc' }), { code: 'UnsupportedBackend' });
    }
    const trap = new WebAssembly.RuntimeError('runtime failure sentinel');
    WebAssembly.instantiate = async () => { throw trap; };
    for (const backend of ['auto', 'wasm-gc']) {
      await assert.rejects(createMigemo({ dictionary, backend }), error =>
        error.code === 'InitializationFailed' && error.cause === trap);
    }
    assert.equal((await createMigemo({ dictionary, backend: 'js' })).backend, 'js');
  `);
});
