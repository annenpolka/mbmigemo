import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDictionary } from '../../scripts/lib/dictionary.mjs';
import { malformedDictionaries, dictionaryLayout } from '../support/malformed.mjs';

test('corruption corpus targets every truncation boundary and unsafe indexes/counts', async () => {
  const bytes = await loadDictionary();
  const before = bytes.slice();
  const cases = malformedDictionaries(bytes);
  assert.equal(cases.filter((c) => c.id.startsWith('truncated-')).length, bytes.length);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) assert.notDeepEqual(c.bytes, bytes, c.id);
  assert.deepEqual(bytes, before);
  const layout = dictionaryLayout(bytes);
  const invalid = cases.find((c) => c.id === 'invalid-value-index').bytes;
  assert.equal(new DataView(invalid.buffer).getInt32(layout.mappingOffset), layout.value.edges);
  assert.ok(layout.mappings > 0);
});
