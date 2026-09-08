import { expect } from '@playwright/test';

export const moduleURL = '/packages/mbmigemo/dist/index.js';
export const tinyURL = '/dictionaries/tiny.compact';

export async function openHarness(page) { await page.goto('/health'); }

// Exercise the actual binary and string operations, independently of the
// wrapper's selection. Unsupported engines remain tested via JS and auto.
export async function nativeWasmSupport(page) {
  return page.evaluate(async () => {
    if (typeof WebAssembly === 'undefined') return false;
    const { featureBytes } = await import('/packages/mbmigemo/dist/feature-bytes.js');
    try {
      const { instance } = await WebAssembly.instantiate(featureBytes, {}, { builtins: ['js-string'], importedStringConstants: '_' });
      return instance.exports.read(instance.exports.create('日本語𠮷\0\ud800')) === '日本語𠮷\0\ud800!';
    } catch (error) {
      if (error instanceof WebAssembly.CompileError || error instanceof WebAssembly.LinkError || error instanceof TypeError) return false;
      throw error;
    }
  });
}

export async function initResult(page, backend, { invalid = false, dictionary = tinyURL } = {}) {
  return page.evaluate(async ({ backend, invalid, dictionary }) => {
    const { createMigemo } = await import('/packages/mbmigemo/dist/index.js');
    const bytes = new Uint8Array(await (await fetch(dictionary)).arrayBuffer());
    try {
      const instance = await createMigemo({ dictionary: invalid ? bytes.subarray(0, 8) : bytes, backend });
      return { backend: instance.backend, matches: new RegExp(instance.query('kensaku'), 'u').test('検索') };
    } catch (error) { return { code: error.code, message: error.message }; }
  }, { backend, invalid, dictionary });
}

export function requestsFor(page) {
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  return (file) => requests.filter((url) => url === `/packages/mbmigemo/dist/${file}`).length;
}

export async function ready(page, suffix = '') {
  await page.goto(`/${suffix}`);
  await expect(page.getByLabel('検索することば')).toBeEnabled();
  await expect(page.getByRole('alert')).toBeHidden();
}
