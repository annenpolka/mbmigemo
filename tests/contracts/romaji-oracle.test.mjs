import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { path } from '../../scripts/lib/common.mjs';
import { loadDictionary } from '../../scripts/lib/dictionary.mjs';
import { referencePatterns } from '../../scripts/lib/reference.mjs';

// Independent finite-language oracle for C/Migemo's generated regex grammar.
// Unsupported syntax fails, rather than being silently treated as a literal.
// This intentionally does not implement romaji or dictionary search.
function enumerateLiterals(pattern) {
  let position = 0;
  const limit = 65_536;
  const unique = (items) => {
    assert.ok(items.length <= limit, 'finite regex enumeration budget exceeded');
    return [...new Set(items)];
  };
  const character = () => {
    assert.ok(position < pattern.length, 'unexpected end of regex');
    if (pattern[position] !== '\\') {
      const value = String.fromCodePoint(pattern.codePointAt(position));
      position += value.length;
      return value;
    }
    position++;
    const escape = pattern[position++];
    if (escape === 'x' || escape === 'u') {
      const length = escape === 'x' ? 2 : 4;
      const hex = pattern.slice(position, position + length);
      assert.match(hex, new RegExp(`^[0-9a-fA-F]{${length}}$`));
      position += length;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    const controls = { n: '\n', r: '\r', t: '\t', f: '\f', v: '\v' };
    if (Object.hasOwn(controls, escape)) return controls[escape];
    assert.ok('\\.*+?^$/{[()|]}-'.includes(escape), `unsupported regex escape: ${escape}`);
    return escape;
  };
  const atom = () => {
    if (pattern[position] === '(') {
      position++;
      if (pattern.slice(position, position + 2) === '?:') position += 2;
      else assert.notEqual(pattern[position], '?', 'lookaround is not a finite literal group');
      const values = expression();
      assert.equal(pattern[position++], ')', 'unterminated group');
      return values;
    }
    if (pattern[position] === '[') {
      position++;
      assert.notEqual(pattern[position], '^', 'negated character classes are unsupported');
      const values = [];
      while (position < pattern.length && pattern[position] !== ']') {
        assert.notEqual(pattern[position], '-', 'character ranges are unsupported');
        values.push(character());
      }
      assert.equal(pattern[position++], ']', 'unterminated character class');
      assert.ok(values.length > 0, 'empty character class is unsupported');
      return unique(values);
    }
    assert.ok(!'.*+?^${}'.includes(pattern[position]), `unsupported regex syntax: ${pattern[position]}`);
    return [character()];
  };
  const expression = () => {
    let choices = [];
    let sequence = [''];
    while (position < pattern.length && pattern[position] !== ')') {
      if (pattern[position] === '|') {
        choices = unique([...choices, ...sequence]);
        sequence = [''];
        position++;
      } else {
        const next = atom();
        assert.ok(sequence.length * next.length <= limit, 'finite regex Cartesian product budget exceeded');
        sequence = unique(sequence.flatMap((prefix) => next.map((suffix) => prefix + suffix)));
      }
    }
    return unique([...choices, ...sequence]);
  };
  const values = expression();
  assert.equal(position, pattern.length, 'unexpected regex suffix');
  const anchored = new RegExp(`^(?:${pattern})$`, 'u');
  for (const value of values) assert.ok(anchored.test(value), 'enumerated literal does not match its source regex');
  return values;
}

test('finite regex oracle enumerates factoring, Unicode, escapes and concatenation', () => {
  assert.deepEqual(new Set(enumerateLiterals('(a[bc]|😀)(?:x|\\x2d)')), new Set(['abx', 'ab-', 'acx', 'ac-', '😀x', '😀-']));
  assert.deepEqual(enumerateLiterals('\\(a\\|b\\)\\n\\t\\\\'), ['(a|b)\n\t\\']);
  assert.deepEqual(enumerateLiterals('[\\]\\[\\^]'), [']', '[', '^']);
  for (const invalid of ['a*', 'a+', 'a?', 'a{2}', '^a', '.', '\\w', '[a-z]', '[^a]', '(?=a)', '(a', 'a)']) {
    assert.throws(() => enumerateLiterals(invalid), undefined, invalid);
  }
});

// Mutual inclusion of every finite literal proves the same unanchored match
// language: any matching document contains at least one enumerated literal.
// This covers candidates absent from the shared comparison document corpus.
function assertSameSearchLanguage(input, expected, actual) {
  const expectedRE = new RegExp(expected, 'u');
  const actualRE = new RegExp(actual, 'u');
  const expectedLiterals = enumerateLiterals(expected);
  const actualLiterals = enumerateLiterals(actual);
  for (const literal of expectedLiterals) {
    assert.ok(actualRE.test(literal), `${JSON.stringify(input)} missing ${JSON.stringify(literal)}`);
  }
  for (const literal of actualLiterals) {
    assert.ok(expectedRE.test(literal), `${JSON.stringify(input)} extra ${JSON.stringify(literal)}`);
  }
  return expectedLiterals.length + actualLiterals.length;
}

test('finite language comparison detects candidate loss and added alternatives', () => {
  assertSameSearchLanguage('n', '(な|に|にゃ|ん)', '(?:な|に|ん)');
  assert.throws(() => assertSameSearchLanguage('n', '(な|に|ん)', '(な|に)'), /missing/);
  assert.throws(() => assertSameSearchLanguage('n', '(な|に|ん)', '(な|に|ん|ぬ)'), /extra/);
});

const tableNames = ['roma2hira', 'hira2kata', 'han2zen', 'zen2han'];
const queries = new Set();
for (const name of tableNames) {
  const source = await readFile(path(`src/romaji/data/${name}.dat`), 'utf8');
  for (const raw of source.split('\n')) {
    // Only derive inputs here. Expected conversion is computed by the pinned C
    // library, including shadowed table keys and its pending-input behavior.
    let line = raw.replace(/^[\t\r\v\f ]+/, '');
    if (line.startsWith('##')) line = line.slice(1);
    else if (line.startsWith('#')) continue;
    if (!line) continue;
    const key = line.split(/[\t\r\v\f ]/, 1)[0];
    for (let length = 1; length <= key.length; length++) {
      const prefix = key.slice(0, length);
      queries.add(prefix);
      if (name === 'roma2hira') queries.add(prefix + 'Nihongo');
    }
    if (name === 'roma2hira') {
      queries.add(key + '?');
      queries.add('ke' + key);
    }
  }
}
for (const input of [
  // C prunes longer dictionary literals before joining phrases. In particular,
  // 検索機Nihongo must not match KensakuNihongo when 検索 is also a candidate.
  'KensakuNihongo', 'KensakuKensaku', 'kenNihongo', 'FooNihongo',
  'AB日本CDx', 'A日本CDx', 'fooBARbaz', 'nNn',
  'mma', 'mb', 'mp', 'tch', 'tcha', 'nna', "n'ya", 'kk', 'szx?',
  'a b', 'a\nb', 'ｶﾞ', 'か\u3099', 'ガ', '😀n', 'n😀', '\\-',
]) queries.add(input);
const inputs = [...queries];
const patterns = await referencePatterns(inputs);
const { createMigemo } = await import(pathToFileURL(path(process.env.MBMIGEMO_MODULE ?? 'packages/mbmigemo/dist/index.js')));
const backends = (process.env.MBMIGEMO_BACKENDS ?? 'js,wasm-gc').split(',');
assert.ok(backends.length > 0 && backends.every((backend) => ['js', 'wasm-gc'].includes(backend)));
assert.equal(new Set(backends).size, backends.length);
for (const backend of backends) {
  test(`${backend}: every conversion key and partial syllable has the C/Migemo search language`, async (context) => {
    const migemo = await createMigemo({ dictionary: await loadDictionary(), backend });
    assert.equal(migemo.backend, backend);
    let literals = 0;
    for (let index = 0; index < inputs.length; index++) {
      literals += assertSameSearchLanguage(inputs[index], patterns[index].pattern, migemo.query(inputs[index]));
    }
    context.diagnostic(`${inputs.length} inputs, ${literals} enumerated literal checks`);
  });
}
