import { readFile } from 'node:fs/promises';
import { CompactDictionaryBuilder, CompactDictionary } from 'jsmigemo';
import { path, json, verifyHash, sha256 } from './common.mjs';
import { loadPracticalDictionaryMetadata } from './practical-dictionary.mjs';

export function parseTSV(source) {
  if (!source.endsWith('\n')) throw new Error('dictionary must end with LF');
  const entries = new Map();
  for (const line of source.slice(0, -1).split('\n')) {
    const [key, ...values] = line.split('\t');
    if (!key || !values.length || values.some((v) => !v) || /[\r\0]/.test(line)) throw new Error('invalid dictionary row');
    // The upstream builder otherwise silently drops unsupported reading keys.
    for (const c of key) {
      const cp = c.codePointAt(0);
      if (!((cp >= 32 && cp <= 126) || (cp >= 0x3041 && cp <= 0x3096) || cp === 0x30fc)) throw new Error(`unsupported compact reading: ${key}`);
    }
    if (entries.has(key)) throw new Error(`duplicate reading: ${key}`);
    entries.set(key, values);
  }
  return entries;
}

export function compileDictionary(source) {
  const entries = parseTSV(source);
  const bytes = Buffer.from(CompactDictionaryBuilder.build(new Map(entries)));
  const dict = readCompactDictionary(bytes);
  // Verify every reading and value survives conversion, including shared prefixes.
  for (const [key, values] of entries) {
    const found = [...dict.search(key)].sort();
    if (JSON.stringify(found) !== JSON.stringify([...values].sort())) throw new Error(`dictionary roundtrip failed: ${key}`);
  }
  return bytes;
}

export function readCompactDictionary(bytes) {
  const dictionary = new CompactDictionary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  // jsmigemo 0.5.2's mapping reader expects a zero after the final group of
  // ones, but when the serialized bit count is a multiple of 64 there is no
  // padding word. Use the logical end when no zero exists. Only the test
  // reader is adapted; the upstream builder and dictionary bytes are intact.
  const mapping = dictionary.mappingBitVector;
  const nextClearBit = mapping.nextClearBit.bind(mapping);
  mapping.nextClearBit = (from) => {
    const end = nextClearBit(from);
    return end < 0 ? mapping.size() : end;
  };
  return dictionary;
}

export async function loadDictionary(fixture = 'tiny') {
  if (fixture === 'practical') {
    const metadata = await loadPracticalDictionaryMetadata();
    const bytes = await readFile(path(metadata.file));
    verifyHash(bytes, metadata.sha256, 'practical compact dictionary');
    return new Uint8Array(bytes);
  }
  if (!['tiny', 'alternate'].includes(fixture)) throw new Error(`unsupported fixture: ${fixture}`);
  const manifest = await json(path('tests/fixtures/manifest.json'));
  const entry = manifest.dictionaries[fixture];
  verifyHash(await readFile(path(entry.source)), entry.sourceSha256, `${fixture} source`);
  const bytes = await readFile(path(entry.file));
  verifyHash(bytes, entry.sha256, `${fixture} compact dictionary`);
  return new Uint8Array(bytes); // Own exactly the view's bytes, not Buffer's pool.
}

export async function dictionaryMetadata(name, bytes) {
  const source = `tests/fixtures/${name}-dict.tsv`;
  return { source, sourceSha256: sha256(await readFile(path(source))), file: `tests/fixtures/${name}.compact`, sha256: sha256(bytes), bytes: bytes.length };
}
