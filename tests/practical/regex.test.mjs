import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { path, json } from '../../scripts/lib/common.mjs';
import { loadFixtures } from '../../scripts/lib/fixtures.mjs';
import { referencePatterns } from '../../scripts/lib/reference.mjs';
import { documentsFor } from '../../scripts/lib/corpus.mjs';

// Frozen counterexamples from the full practical comparison. Flat alternation
// made the first two cost several seconds in V8's FillInBMInfo; the shorter
// repeated Ka query exposes the same combinatorial compilation behavior.
const cases = await json(path('tests/practical/cases.json'));

test('practical mixed-case patterns execute and preserve the C/Migemo match set', async (t) => {
  const fixtures = await loadFixtures();
  const patterns = await referencePatterns(cases.map(({ input }) => input), 'practical');
  for (const backend of ['js', 'wasm-gc']) {
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      await t.test(`${backend}: ${c.id} ${c.input}`, () => {
        // A separate process bounds synchronous RegExp compilation, which a
        // timer in the test process cannot interrupt. This generous timeout
        // catches a hang; printed timings are diagnostics, not speed ratios.
        const result = spawnSync(process.execPath, [path('tests/practical/query-worker.mjs')], {
          input: JSON.stringify({ input: c.input, backend, expectedPattern: patterns[i].pattern,
            documents: documentsFor(c, fixtures.documents) }),
          encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        const measured = JSON.parse(result.stdout);
        assert.equal(measured.backend, backend);
        assert.deepEqual(measured.missing, []);
        assert.deepEqual(measured.extra, []);
        t.diagnostic(JSON.stringify(measured));
      });
    }
  }
});
