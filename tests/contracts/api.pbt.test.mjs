import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import fc from 'fast-check';
import { path } from '../../scripts/lib/common.mjs';
import { compileDictionary, loadDictionary } from '../../scripts/lib/dictionary.mjs';
import { loadFixtures } from '../../scripts/lib/fixtures.mjs';
import { referencePatterns } from '../../scripts/lib/reference.mjs';
import { compareCase } from '../../scripts/lib/compare.mjs';
import { registerProperties } from '../support/pbt.mjs';
import { dictionaryEntries, toTSV, edit, editedInput } from '../support/arbitraries.mjs';

// Deliberately requires the actual implementation, like the fixed API contracts.
const { createMigemo } = await import(pathToFileURL(path(process.env.MBMIGEMO_MODULE ?? 'packages/mbmigemo/dist/index.js')));
assert.equal(typeof createMigemo, 'function');
const backends = (process.env.MBMIGEMO_BACKENDS ?? 'js,wasm-gc').split(',');
assert.ok(backends.length && backends.every((b) => ['js', 'wasm-gc'].includes(b)));
assert.equal(new Set(backends).size, backends.length);
const { documents } = await loadFixtures();
const properties = {};

for (const backend of backends) {
  properties[`api-${backend}-dictionary-candidates`] = fc.asyncProperty(dictionaryEntries, async (entries) => {
    const instance = await createMigemo({ dictionary: new Uint8Array(compileDictionary(toTSV(entries))), backend });
    assert.equal(instance.backend, backend);
    for (const [reading] of entries) {
      const pattern = instance.query(reading);
      assert.equal(typeof pattern, 'string');
      const re = new RegExp(pattern, 'u');
      const wanted = entries.filter(([key]) => key.startsWith(reading)).flatMap(([, values]) => values);
      for (const value of wanted) assert.ok(re.test(value), `query=${reading}, candidate=${value}`);
    }
    assert.equal(instance.query(''), '(?!)');
  });

  properties[`api-${backend}-truncation`] = fc.asyncProperty(dictionaryEntries, fc.nat(), async (entries, position) => {
    const valid = compileDictionary(toTSV(entries));
    const truncated = new Uint8Array(valid.slice(0, position % valid.length));
    await assert.rejects(async () => createMigemo({ dictionary: truncated, backend }), (error) => error instanceof Error && error.code === 'InvalidDictionary');
  });

  properties[`api-${backend}-edit-history`] = fc.asyncProperty(fc.array(edit, { maxLength: 32 }), async (actions) => {
    const dictionaries = await Promise.all([loadDictionary('tiny'), loadDictionary('alternate')]);
    const instances = await Promise.all(dictionaries.map((dictionary) => createMigemo({ dictionary, backend })));
    for (const instance of instances) assert.equal(instance.backend, backend);
    for (const dictionary of dictionaries) dictionary.fill(0);

    // Build a pure input-state trace, then obtain independent C oracle outputs.
    const state = ['kensaku', 'nihongo'];
    const trace = [[...state]];
    for (const { instance, action } of actions) {
      state[instance] = editedInput(state[instance], action);
      trace.push([...state]);
    }
    const expected = await Promise.all(['tiny', 'alternate'].map(async (fixture, id) => {
      const inputs = [...new Set(trace.map((row) => row[id]).filter(Boolean))];
      const patterns = await referencePatterns(inputs, fixture);
      return new Map(inputs.map((input, i) => [input, patterns[i].pattern]));
    }));
    for (const inputs of trace) {
      // Query both instances at each step to catch cross-instance pollution.
      for (let id = 0; id < 2; id++) {
        const input = inputs[id], actual = instances[id].query(input);
        if (input === '') assert.equal(actual, '(?!)');
        else {
          assert.equal(compareCase({ id: `pbt-instance-${id}`, class: 'edit-history', input }, expected[id].get(input), actual, [...documents, input, `前${input}後`]), null);
        }
      }
    }
  });
}
registerProperties(properties);
