import { test, expect } from '@playwright/test';

test('server exposes only public artifact routes with proper Wasm MIME', async ({ request }) => {
  for (const route of ['/PLAN.md', '/.git/config', '/package.json', '/tests/fixtures/tiny-dict.tsv', '/%2e%2e/package.json', '/packages/mbmigemo/dist/../../src/index.ts']) {
    expect((await request.get(route)).status()).toBe(404);
  }
  const wasm = await request.get('/packages/mbmigemo/dist/core.wasm');
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()['content-type']).toBe('application/wasm');
  expect(wasm.headers()['cache-control']).toBe('no-store');
  expect(wasm.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(wasm.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect((await request.post('/')).status()).toBe(405);
  const head = await request.head('/packages/mbmigemo/dist/core.wasm');
  expect(head.status()).toBe(200);
  expect((await head.body()).length).toBe(0);
});
