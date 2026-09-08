// Locate sections in the *valid* pinned fixture solely to make targeted corrupt
// inputs. This is not a dictionary validator or a replacement for the core.
export function dictionaryLayout(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 0;
  const section = (width) => {
    const countOffset = cursor;
    const edges = view.getUint32(cursor); cursor += 4;
    const edgeOffset = cursor; cursor += edges * width;
    const bitsOffset = cursor;
    const bits = view.getUint32(cursor); cursor += 4;
    const wordsOffset = cursor; cursor += Math.ceil(bits / 64) * 8;
    return { countOffset, edges, edgeOffset, bitsOffset, wordsOffset, bits };
  };
  const key = section(1), value = section(2);
  const mappingBitsOffset = cursor;
  const mappingBits = view.getUint32(cursor); cursor += 4;
  const mappingWordsOffset = cursor; cursor += Math.ceil(mappingBits / 64) * 8;
  const mappingCountOffset = cursor;
  const mappings = view.getUint32(cursor); cursor += 4;
  const mappingOffset = cursor; cursor += mappings * 4;
  if (cursor !== bytes.length) throw new Error('fixture section layout changed');
  return { key, value, mappingBitsOffset, mappingWordsOffset, mappingCountOffset, mappingOffset, mappings };
}

export function malformedDictionaries(valid) {
  const layout = dictionaryLayout(valid);
  const result = [];
  const mutate = (id, change) => {
    const bytes = new Uint8Array(valid);
    change(new DataView(bytes.buffer), bytes);
    result.push({ id, bytes });
  };
  // Each proper prefix catches off-by-one range checks at and within sections.
  for (let length = 0; length < valid.length; length++) result.push({ id: `truncated-${length}`, bytes: valid.slice(0, length) });
  for (const [name, offset] of [['key', layout.key.countOffset], ['value', layout.value.countOffset], ['mapping', layout.mappingCountOffset]]) {
    mutate(`${name}-huge-count`, (view) => view.setUint32(offset, 0x7fffffff));
    mutate(`${name}-negative-count`, (view) => view.setUint32(offset, 0xffffffff));
  }
  mutate('invalid-compact-character', (_, bytes) => { bytes[layout.key.edgeOffset + 2] = 0xff; });
  mutate('invalid-value-index', (view) => view.setInt32(layout.mappingOffset, layout.value.edges));
  mutate('negative-value-index', (view) => view.setInt32(layout.mappingOffset, -1));
  mutate('zero-key-bits', (view) => view.setUint32(layout.key.bitsOffset, 0));
  mutate('key-topology-cleared', (_, bytes) => bytes.fill(0, layout.key.wordsOffset, layout.value.countOffset));
  result.push({ id: 'trailing-byte', bytes: new Uint8Array([...valid, 0]) });
  return result;
}
