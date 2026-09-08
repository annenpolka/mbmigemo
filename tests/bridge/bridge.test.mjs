import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { path } from '../../scripts/lib/common.mjs';
import { loadDictionary } from '../../scripts/lib/dictionary.mjs';

const js = await import(pathToFileURL(path('_build/js/release/build/bridge/bridge.js')));
const wasm = (await WebAssembly.instantiate(await readFile(path('_build/wasm-gc/release/build/bridge/bridge.wasm')), {}, { builtins: ['js-string'], importedStringConstants: '_' })).instance.exports;
const checksum = (bytes) => bytes.reduce((hash, byte) => Math.imul(hash ^ byte, 16777619) >>> 0, 2166136261);

for (const [backend, bridge] of [['js', js], ['wasm-gc', wasm]]) {
  const snapshot = (bytes) => backend === 'js'
    ? bridge.snapshot_bytes(bytes)
    : bridge.snapshot_latin1(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

  test(`${backend}: JS strings preserve UTF-16 including NUL and unpaired surrogates`, () => {
    for (const value of ['', 'けんさく', 'ｶﾞ', 'か\u3099', '𠮷😀', 'a\0b', '\ud800', '\udc00', 'a\r\nb']) {
      assert.equal(bridge.echo(value), value);
      assert.equal(bridge.utf16_length(value), value.length);
    }
  });

  test(`${backend}: byte handles preserve views, contents, checksum, and ownership`, async () => {
    const sources = [new Uint8Array(), Uint8Array.from([0, 127, 128, 255]), Uint8Array.from({ length: 65_536 }, (_, i) => i & 255), await loadDictionary(), await loadDictionary('alternate')];
    const records = sources.map((bytes) => {
      const padded = new Uint8Array(bytes.length + 16).fill(42);
      padded.set(bytes, 7);
      const handle = snapshot(padded.subarray(7, 7 + bytes.length));
      padded.fill(0);
      return { handle, bytes };
    });
    // Read earlier handles after later allocations: catches shared global data.
    for (const { handle, bytes } of records.reverse()) {
      assert.equal(bridge.byte_length(handle), bytes.length);
      assert.equal(bridge.checksum(handle) >>> 0, checksum(bytes));
      for (let i = 0; i < bytes.length; i++) assert.equal(bridge.byte_at(handle, i), bytes[i], `byte ${i}`);
    }
  });
}
