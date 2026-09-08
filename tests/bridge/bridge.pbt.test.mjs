import assert from 'node:assert/strict';
import fc from 'fast-check';
import { loadBridges } from '../support/bridge.mjs';
import { registerProperties } from '../support/pbt.mjs';
import { utf16Text, byteArray } from '../support/arbitraries.mjs';

const bridges = await loadBridges();
const fnv = (bytes) => {
  // BigInt reference avoids reproducing the core's UInt arithmetic.
  let hash = 2166136261n;
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * 16777619n) & 0xffffffffn;
  return Number(hash);
};

registerProperties({
  'bridge-utf16': fc.property(utf16Text, (value) => {
    for (const { backend, bridge } of bridges) {
      assert.equal(bridge.echo(value), value, backend);
      assert.equal(bridge.utf16_length(value), value.length, backend);
    }
  }),

  'bridge-byte-ownership': fc.property(byteArray, byteArray, fc.integer({ min: 0, max: 32 }), fc.integer({ min: 0, max: 32 }), (bytes, other, offset, suffix) => {
    for (const { backend, bridge, snapshot } of bridges) {
      const source = new Uint8Array(offset + bytes.length + suffix).fill(0xee);
      source.set(bytes, offset);
      const handle = snapshot(source.subarray(offset, offset + bytes.length));
      // Another allocation and changes to all input bytes must leave the first
      // handle intact. Offsets and lengths shrink alongside the byte content.
      const second = snapshot(other);
      for (let i = 0; i < source.length; i++) source[i] ^= 0xff;
      for (const [owned, expected] of [[handle, bytes], [second, other]]) {
        assert.equal(bridge.byte_length(owned), expected.length, backend);
        assert.equal(bridge.checksum(owned) >>> 0, fnv(expected), backend);
        const actual = Uint8Array.from({ length: expected.length }, (_, i) => bridge.byte_at(owned, i));
        assert.deepEqual(actual, expected, backend);
      }
    }
  }),
});
