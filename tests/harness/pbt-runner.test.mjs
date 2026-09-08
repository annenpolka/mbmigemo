import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { checkProperty, parametersFromEnv } from '../support/pbt.mjs';

test('PBT shrinks an injected fault, saves its counterexample, and replays it', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'mbmigemo-pbt-'));
  try {
    // Deliberately wrong preservation law: simulates dropping the final byte.
    const faulty = fc.property(fc.uint8Array({ minLength: 1, maxLength: 64 }), (bytes) => bytes.slice(0, -1).length === bytes.length);
    const parameters = parametersFromEnv({});
    await assert.rejects(checkProperty('shrink-sentinel', faulty, parameters, temporary), /Counterexample/);
    const first = JSON.parse(await readFile(join(temporary, 'shrink-sentinel.json'), 'utf8'));
    assert.equal(first.status, 'failed');
    assert.ok(first.shrinks > 0);
    assert.equal(first.counterexample, '[Uint8Array.from([0])]');
    await assert.rejects(checkProperty('shrink-sentinel', faulty, { ...parameters, seed: first.seed, path: first.path }, temporary));
    const replay = JSON.parse(await readFile(join(temporary, 'shrink-sentinel.json'), 'utf8'));
    assert.equal(replay.counterexample, first.counterexample);
    assert.equal(replay.shrinks, 0);
    await checkProperty('shrink-sentinel', fc.property(fc.integer(), (n) => n === n), parameters, temporary);
    assert.equal(JSON.parse(await readFile(join(temporary, 'shrink-sentinel.json'), 'utf8')).status, 'passed');
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('PBT rejects zero runs and ambiguous replay settings', () => {
  for (const env of [{ PBT_RUNS: '0' }, { PBT_RUNS: 'typo' }, { PBT_SEED: 'NaN' }, { PBT_SEED: '2147483648' }, { PBT_PATH: '0:1' }, { PBT_PROPERTY: 'x', PBT_PATH: '0:1' }]) {
    assert.throws(() => parametersFromEnv(env));
  }
});
