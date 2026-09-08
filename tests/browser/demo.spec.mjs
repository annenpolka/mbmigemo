import { test, expect } from '@playwright/test';
import { ready, nativeWasmSupport } from './helpers.mjs';

test('practical dictionary demo highlights Japanese and clears results during editing', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await ready(page);
  const query = page.getByLabel('検索することば');
  await expect(page.locator('#dictionary-name')).toContainText('practical');
  await expect(page.locator('#dictionary-sha')).toHaveText(/^[a-f0-9]{64}$/);
  await expect(page.locator('#results mark').first()).toHaveText('検索');
  const readyRequestCount = requests.length;
  for (const [input, match] of [['nihongo', '日本語'], ['toukyou', '東京'], ['gakkou', '学校'], ['kensak', '検索'], ['kensaku', '検索']]) {
    await query.fill(input);
    await expect(page.locator('#results mark').filter({ hasText: match }).first()).toBeVisible();
  }
  await query.fill('');
  await expect(page.locator('#results li')).toHaveCount(0);
  await expect(page.locator('#pattern')).toHaveText('(?!)');
  await expect(page.locator('#empty')).toContainText('ことばを入力');
  expect(requests.length).toBe(readyRequestCount);
  expect(requests.filter((url) => url === '/dictionaries/practical.compact')).toHaveLength(1);
});

test('backend controls preserve the current query and show unsupported errors honestly', async ({ page }) => {
  await ready(page, '?dictionary=tiny');
  const query = page.getByLabel('検索することば');
  await query.fill('nihongo');
  const supported = await nativeWasmSupport(page);
  await page.getByRole('combobox', { name: '実行方式', exact: true }).selectOption('wasm-gc');
  if (supported) {
    await expect(query).toBeEnabled();
    await expect(page.locator('#actual-backend')).toHaveText('wasm-gc');
    await expect(page.locator('#results mark').filter({ hasText: '日本語' }).first()).toBeVisible();
  } else {
    await expect(query).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('対応していません');
    await expect(page.locator('#results li')).toHaveCount(0);
  }
  await page.getByRole('combobox', { name: '実行方式', exact: true }).selectOption('auto');
  await expect(query).toBeEnabled();
  await expect(query).toHaveValue('nihongo');
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.locator('#actual-backend')).toHaveText(supported ? 'wasm-gc' : 'js');
  await page.getByRole('combobox', { name: '実行方式', exact: true }).selectOption('js');
  await expect(page.locator('#actual-backend')).toHaveText('js');
});

test('highlighting preserves composed, decomposed, astral, and HTML-like text', async ({ page }) => {
  await ready(page, '?dictionary=tiny');
  for (const input of ['が', '𠮷', '😀', '[x]', 'a.b', '<img']) {
    await page.getByLabel('検索することば').fill(input);
    await expect(page.locator('#results mark').filter({ hasText: input }).first()).toHaveText(input);
    await expect(page.locator('#results')).toContainText(input);
  }
  await expect(page.locator('#results img')).toHaveCount(0);
  await expect(page.locator('#results')).toContainText('<img src=x onerror=alert(1)>');
  expect(await page.locator('#results').evaluate((node) => node.textContent.includes('<img src=x onerror=alert(1)>'))).toBe(true);
});

test('dictionary download and corruption failures never become empty success', async ({ page }) => {
  await page.route('**/dictionaries/practical.compact', (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('辞書の取得に失敗');
  await expect(page.getByLabel('検索することば')).toBeDisabled();
  await expect(page.locator('#results li')).toHaveCount(0);
  await page.unroute('**/dictionaries/practical.compact');
  await page.route('**/dictionaries/practical.compact', (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.alloc(8) }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('InvalidDictionary');
  await expect(page.getByLabel('検索することば')).toBeDisabled();
});

test('the demo remains usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page, '?dictionary=tiny');
  await expect(page.getByLabel('検索することば')).toBeInViewport();
  await expect(page.getByRole('combobox', { name: '実行方式', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a delayed backend initialization cannot replace a newer selection', async ({ page }) => {
  await page.addInitScript(() => {
    const original = WebAssembly.instantiate;
    let release;
    const delayed = new Promise((resolve) => { release = resolve; });
    globalThis.testReleaseProbe = release;
    globalThis.testProbeWaiting = false;
    globalThis.testProbeFinished = false;
    WebAssembly.instantiate = async (...args) => {
      globalThis.testProbeWaiting = true;
      await delayed;
      try { return await original(...args); }
      finally { globalThis.testProbeFinished = true; }
    };
  });
  await ready(page, '?dictionary=tiny');
  const query = page.getByLabel('検索することば');
  await query.fill('nihongo');
  await page.getByRole('combobox', { name: '実行方式' }).selectOption('wasm-gc');
  await expect.poll(() => page.evaluate(() => globalThis.testProbeWaiting)).toBe(true);
  await expect(query).toBeDisabled();
  await page.getByRole('combobox', { name: '実行方式' }).selectOption('js');
  await expect(query).toBeEnabled();
  await page.evaluate(() => globalThis.testReleaseProbe());
  await expect.poll(() => page.evaluate(() => globalThis.testProbeFinished)).toBe(true);
  // A pending core download, if selected by the released probe, must finish
  // before checking that its stale completion has not replaced JS.
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#actual-backend')).toHaveText('js');
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(query).toHaveValue('nihongo');
  await expect(page.locator('#results mark').filter({ hasText: '日本語' }).first()).toBeVisible();
});
