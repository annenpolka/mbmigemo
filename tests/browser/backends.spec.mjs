import { test, expect } from '@playwright/test';
import { openHarness, nativeWasmSupport, initResult, requestsFor } from './helpers.mjs';

test('default and explicit JS fetch only the JS core', async ({ page }) => {
  const count = requestsFor(page);
  await page.addInitScript(() => { globalThis.WebAssembly = undefined; });
  await openHarness(page);
  expect(await initResult(page, undefined)).toEqual({ backend: 'js', matches: true });
  expect(await initResult(page, 'js')).toEqual({ backend: 'js', matches: true });
  expect(count('core.js')).toBe(1);
  expect(count('core.wasm')).toBe(0);
  expect(count('feature-bytes.js')).toBe(0);
});

test('native Wasm capability controls explicit and auto backends without eager loading', async ({ page, browser }, testInfo) => {
  await openHarness(page);
  const supported = await nativeWasmSupport(page);
  await testInfo.attach('capability.json', { body: JSON.stringify({ browser: browser.browserType().name(), version: browser.version(), wasmGCAndStringBuiltins: supported }), contentType: 'application/json' });
  // Reload the document to remove the independently loaded feature probe from
  // its module map, then count every module the public API itself requests.
  await page.reload();
  const count = requestsFor(page);
  const explicit = await initResult(page, 'wasm-gc');
  if (supported) expect(explicit).toEqual({ backend: 'wasm-gc', matches: true });
  else expect(explicit.code).toBe('UnsupportedBackend');
  expect(await initResult(page, 'auto')).toEqual({ backend: supported ? 'wasm-gc' : 'js', matches: true });
  expect(count('core.wasm')).toBe(supported ? 1 : 0);
  expect(count('core.js')).toBe(supported ? 0 : 1);
  expect(count('feature-bytes.js')).toBe(1);
});

test('auto with unavailable features falls back; corrupt dictionaries still reject', async ({ page }) => {
  const count = requestsFor(page);
  await page.addInitScript(() => { globalThis.WebAssembly = undefined; });
  await openHarness(page);
  expect(await initResult(page, 'auto')).toEqual({ backend: 'js', matches: true });
  expect((await initResult(page, 'wasm-gc')).code).toBe('UnsupportedBackend');
  expect((await initResult(page, 'auto', { invalid: true })).code).toBe('InvalidDictionary');
  expect(count('core.js')).toBe(1);
  expect(count('core.wasm')).toBe(0);
  expect(count('feature-bytes.js')).toBe(0);
});

test('auto exposes dictionary corruption on the native selected backend', async ({ page }) => {
  await openHarness(page);
  const supported = await nativeWasmSupport(page);
  await page.reload();
  const count = requestsFor(page);
  expect((await initResult(page, 'auto', { invalid: true })).code).toBe('InvalidDictionary');
  expect(count('core.wasm')).toBe(supported ? 1 : 0);
  expect(count('core.js')).toBe(supported ? 0 : 1);
  expect(await initResult(page, 'auto')).toEqual({ backend: supported ? 'wasm-gc' : 'js', matches: true });
});

test('feature probe download errors and runtime traps never select JS', async ({ page }) => {
  await openHarness(page);
  const count = requestsFor(page);
  await page.route('**/feature-bytes.js', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
  expect((await initResult(page, 'auto')).code).toBe('InitializationFailed');
  expect(count('core.js')).toBe(0);
  expect(count('core.wasm')).toBe(0);
  await page.unroute('**/feature-bytes.js');
  await page.reload();
  await page.evaluate(() => { WebAssembly.instantiate = async () => { throw new WebAssembly.RuntimeError('test trap'); }; });
  expect((await initResult(page, 'auto')).code).toBe('InitializationFailed');
  expect(count('core.js')).toBe(0);
  expect(count('core.wasm')).toBe(0);
});

test('core fetch failures are surfaced and a failed Wasm download can retry', async ({ page }) => {
  await openHarness(page);
  const supported = await nativeWasmSupport(page);
  await page.reload();
  const count = requestsFor(page);
  const artifact = supported ? 'core.wasm' : 'core.js';
  await page.route(`**/${artifact}`, (route) => route.fulfill({ status: 503, body: 'temporary error' }));
  expect((await initResult(page, 'auto')).code).toBe('InitializationFailed');
  expect(count(supported ? 'core.js' : 'core.wasm')).toBe(0);
  await page.unroute(`**/${artifact}`);
  // Browsers cache failed JS module imports for the document lifetime; Wasm
  // fetching is deliberately retryable on the same module instance.
  if (!supported) await page.reload();
  expect(await initResult(page, 'auto')).toEqual({ backend: supported ? 'wasm-gc' : 'js', matches: true });
});

test('HTTP-successful but corrupt core artifacts cannot trigger auto fallback', async ({ page }) => {
  await openHarness(page);
  const supported = await nativeWasmSupport(page);
  await page.reload();
  const count = requestsFor(page);
  const artifact = supported ? 'core.wasm' : 'core.js';
  await page.route(`**/${artifact}`, (route) => route.fulfill({
    status: 200,
    contentType: supported ? 'application/wasm' : 'text/javascript',
    body: supported ? Buffer.from([0, 97, 115]) : 'throw new Error("damaged core");',
  }));
  expect((await initResult(page, 'auto')).code).toBe('InitializationFailed');
  expect(count(supported ? 'core.js' : 'core.wasm')).toBe(0);
});
