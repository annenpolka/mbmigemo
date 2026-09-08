import fc from 'fast-check';

const textOf = (character, minLength, maxLength) => fc.array(character, { minLength, maxLength }).map((chars) => chars.join(''));

// The key alphabet is precisely inside the compact dictionary's encoding.
export const reading = textOf(fc.constantFrom('a', 'b', 'n', 's', 'か', 'が', 'け', 'ん', 'さ', 'く', 'し', 'ー'), 1, 8);
const scalar = fc.oneof(
  fc.constantFrom('検索', '日本語', 'が', 'か\u3099', 'ｶﾞ', '𠮷', '😀', '.', '*', '?', '[', ']', '-', '\\', '(', ')', '|', '^', '$', '{', '}', '+', '/', ' '),
  fc.integer({ min: 0x20, max: 0xd7ff }).map(String.fromCodePoint),
  fc.integer({ min: 0xe000, max: 0x10ffff }).map(String.fromCodePoint),
);
export const unicodeText = textOf(scalar, 0, 16);
export const literal = textOf(scalar, 1, 8);
export const utf16Text = fc.oneof(
  fc.array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 128 }).map((units) => String.fromCharCode(...units)),
  textOf(fc.constantFrom('\0', '\ud800', '\udfff', '𠮷', '😀', 'か\u3099', 'ｶﾞ', '\uffff', '\r\n'), 0, 24),
);
export const byteArray = fc.oneof(
  fc.uint8Array({ maxLength: 4096 }),
  fc.constantFrom(0, 1, 31, 32, 33, 63, 64, 65, 127, 128, 129, 255, 256, 257, 1024, 4096)
    .chain((length) => fc.uint8Array({ minLength: length, maxLength: length })),
);

export const dictionaryEntries = fc.uniqueArray(
  fc.tuple(reading, fc.uniqueArray(literal, { minLength: 1, maxLength: 5 })),
  { selector: ([key]) => key, minLength: 1, maxLength: 24 },
);
export const toTSV = (entries) => entries.map(([key, values]) => [key, ...values].join('\t') + '\n').join('');

export const queryFragment = fc.constantFrom('k', 'ken', 'kensaku', 'nihongo', 'n', 'nn', 'shi', 'si', 'kk', 'gakkou', 'sha', 'が', 'か\u3099', 'ｶﾞ', '𠮷', '😀', '.', '[', ']', '\\', '-', ' ', '\t', '\n');
export const oracleInput = textOf(queryFragment, 1, 8);
export const edit = fc.record({
  instance: fc.integer({ min: 0, max: 1 }),
  action: fc.oneof(
    fc.record({ kind: fc.constant('append'), text: queryFragment }),
    fc.record({ kind: fc.constant('replace'), text: oracleInput }),
    fc.record({ kind: fc.constant('delete'), count: fc.integer({ min: 1, max: 4 }) }),
    fc.record({ kind: fc.constant('clear') }),
  ),
});

// A plain string model: independent of both Migemo's implementation and regexes.
export function editedInput(input, action) {
  switch (action.kind) {
    case 'append': return input + action.text;
    case 'replace': return action.text;
    case 'delete': return [...input].slice(0, Math.max(0, [...input].length - action.count)).join('');
    case 'clear': return '';
    default: throw new Error(`Unknown edit: ${action.kind}`);
  }
}
