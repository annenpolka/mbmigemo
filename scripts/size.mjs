import { readFile } from 'node:fs/promises';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { path, sha256, atomicWrite, encodeJSON, options } from './lib/common.mjs';
import { loadDictionary } from './lib/dictionary.mjs';

export const compression = { gzip: { level: 9 }, brotli: { quality: 11, mode: 'generic', lgwin: 22 }, aggregation: 'sum of individually compressed HTTP resources; no shared compression context' };
function sizes(bytes) {
  return { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC, [constants.BROTLI_PARAM_LGWIN]: 22 } }).length };
}

export async function sizeReport(fixture = 'practical') {
  const dictionary = await loadDictionary(fixture);
  const files = {};
  for (const name of ['index.js', 'core.js', 'core.wasm', 'feature-bytes.js']) {
    const bytes = await readFile(path(`packages/mbmigemo/dist/${name}`));
    files[name] = { sha256: sha256(bytes), ...sizes(bytes) };
  }
  const backends = {};
  for (const [backend, names] of Object.entries({ js: ['index.js', 'core.js'], 'wasm-gc': ['index.js', 'feature-bytes.js', 'core.wasm'] })) {
    backends[backend] = { files: names, ...Object.fromEntries(['raw', 'gzip', 'brotli'].map((kind) => [kind, names.reduce((sum, name) => sum + files[name][kind], 0)])) };
  }
  return { schema: 1, compression, node: process.version, zlib: process.versions.zlib, brotli: process.versions.brotli,
    scope: 'Unminified release executable code plus public ESM wrapper and required feature probe. Type declarations, licenses, HTTP headers, demo, source maps and dictionary are excluded from code totals. Dictionary is identical and reported separately.',
    files, backends, dictionary: { fixture, sha256: sha256(dictionary), ...sizes(dictionary) } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = options(process.argv.slice(2), ['--fixture', '--report']);
  const result = await sizeReport(args['--fixture'] ?? 'practical');
  const report = path(args['--report'] ?? 'bench/results/size.json');
  await atomicWrite(report, encodeJSON(result));
  console.table({ ...result.backends, dictionary: result.dictionary });
  console.log(`Size receipt: ${report}`);
}
