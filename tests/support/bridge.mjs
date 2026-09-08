import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { path } from '../../scripts/lib/common.mjs';

export async function loadBridges() {
  const js = await import(pathToFileURL(path('_build/js/release/build/bridge/bridge.js')));
  const wasm = (await WebAssembly.instantiate(
    await readFile(path('_build/wasm-gc/release/build/bridge/bridge.wasm')), {},
    { builtins: ['js-string'], importedStringConstants: '_' },
  )).instance.exports;
  return [
    { backend: 'js', bridge: js, snapshot: (bytes) => js.snapshot_bytes(bytes) },
    { backend: 'wasm-gc', bridge: wasm, snapshot: (bytes) => wasm.snapshot_latin1(Array.from(bytes, (b) => String.fromCharCode(b)).join('')) },
  ];
}
