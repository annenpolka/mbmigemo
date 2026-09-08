import { test, expect } from '@playwright/test';
import { loadFixtures } from '../../scripts/lib/fixtures.mjs';
import { documentsFor } from '../../scripts/lib/corpus.mjs';
import { openHarness, nativeWasmSupport } from './helpers.mjs';

const fixtures = await loadFixtures();
const cases = fixtures.manual.map((item, index) => ({ input: item.input, expected: fixtures.golden[index].pattern, documents: documentsFor(item, fixtures.documents) }));

test('real browser regex match sets agree with C/Migemo and preserve raw UTF-16', async ({ page }) => {
  await openHarness(page);
  const supported = await nativeWasmSupport(page);
  const outcome = await page.evaluate(async ({ cases, supported }) => {
    const { createMigemo } = await import('/packages/mbmigemo/dist/index.js');
    const dictionary = new Uint8Array(await (await fetch('/dictionaries/tiny.compact')).arrayBuffer());
    const failures = [];
    const backends = supported ? ['js', 'wasm-gc'] : ['js', 'auto'];
    for (const backend of backends) {
      const instance = await createMigemo({ dictionary, backend });
      for (const item of cases) {
        const expected = new RegExp(item.expected, 'u');
        const actual = new RegExp(instance.query(item.input), 'u');
        for (const document of item.documents) {
          if (expected.test(document) !== actual.test(document)) failures.push({ backend, input: item.input, document });
        }
      }
      for (const input of ['\0', 'a\0b', '\ud800', '\udc00', 'a\ud800b', '😀', '𠮷']) {
        const expression = new RegExp(`^(?:${instance.query(input)})$`, 'u');
        if (!expression.test(input)) failures.push({ backend, input, kind: 'utf16' });
        for (const corrupted of [input.replaceAll('\0', ''), input.replace(/[\ud800-\udfff]/gu, '�')])
          if (corrupted !== input && expression.test(corrupted)) failures.push({ backend, input, corrupted, kind: 'utf16-loss' });
      }
      if (instance.query('') !== '(?!)') failures.push({ backend, kind: 'empty' });
    }
    return { failures, checked: cases.length * backends.length };
  }, { cases, supported });
  expect(outcome.failures).toEqual([]);
  expect(outcome.checked).toBe(214);
});

test('concurrent dictionary instances retain snapshots through input editing', async ({ page }) => {
  await openHarness(page);
  const supported = await nativeWasmSupport(page);
  const outcome = await page.evaluate(async ({ sequences, supported }) => {
    const { createMigemo } = await import('/packages/mbmigemo/dist/index.js');
    const failures = [];
    for (const backend of supported ? ['js', 'wasm-gc'] : ['js', 'auto']) {
      const sources = await Promise.all(['tiny', 'alternate'].map(async (name) => new Uint8Array(await (await fetch(`/dictionaries/${name}.compact`)).arrayBuffer())));
      const pending = sources.map((dictionary) => createMigemo({ dictionary, backend }));
      sources.forEach((source) => source.fill(0));
      const instances = await Promise.all(pending);
      const baseline = instances.map((instance) => new Map(sequences.flat().map((query) => [query, instance.query(query)])));
      for (const sequence of sequences) for (const query of sequence) {
        instances.forEach((instance, index) => {
          if (instance.query(query) !== baseline[index].get(query)) failures.push({ backend, index, query, kind: 'history' });
        });
      }
      const patterns = instances.map((instance) => new RegExp(instance.query('kensaku'), 'u'));
      if (!patterns[0].test('検索') || patterns[0].test('探索別館') || !patterns[1].test('探索別館') || patterns[1].test('検索')) failures.push({ backend, kind: 'independence' });
    }
    return failures;
  }, { sequences: fixtures.sequences, supported });
  expect(outcome).toEqual([]);
});
