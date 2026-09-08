export const seed = 20260908;
export const generatedCount = 10_000;
export const sampleWords = [
  ['kensaku', 'けんさく', '検索'], ['nihongo', 'にほんご', '日本語'],
  ['gakkou', 'がっこう', '学校'], ['kitte', 'きって', '切手'],
  ['shashin', 'しゃしん', '写真'], ['shinbun', 'しんぶん', '新聞'],
  ['matcha', 'まっちゃ', '抹茶'], ['toukyou', 'とうきょう', '東京'],
];
export const classes = ['prefix', 'romaji', 'case', 'width', 'unicode', 'metacharacter', 'deletion', 'unknown'];

export function generateCorpus(initialSeed = seed, count = generatedCount) {
  let state = initialSeed >>> 0;
  const random = (limit) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % limit;
  };
  const choose = (items) => items[random(items.length)];
  const syllables = ['ka', 'ga', 'shi', 'si', 'sha', 'chi', 'tsu', 'nn', 'n', 'kya', 'gyu', 'ryo', 'xtsu', 'kk', 'pa', 'z'];
  const unicode = ['が', 'か\u3099', 'ガ', 'ｶﾞ', '𠮷', '😀', '漢字', '\u0301'];
  const symbols = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '[', ']', '|', '\\', '-', '/', ' ', '\t', '\n'];
  const result = [];
  const seen = new Set();
  let attempts = 0;
  for (let i = 0; i < count;) {
    if (++attempts > count * 100) throw new Error('could not generate enough distinct inputs');
    const category = classes[i % classes.length];
    const parts = Array.from({ length: 1 + random(4) }, () => choose(sampleWords));
    const [roman, hira, word] = [0, 1, 2].map((column) => parts.map((p) => p[column]).join(''));
    let input;
    switch (category) {
      case 'prefix': input = roman.slice(0, 1 + random(roman.length)); break;
      case 'romaji': input = Array.from({ length: 1 + random(8) }, () => choose(syllables)).join(''); break;
      case 'case': input = [...roman].map((c) => random(2) ? c.toUpperCase() : c).join(''); break;
      case 'width': input = [...roman].map((c) => random(2) ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c).join(''); break;
      case 'unicode': input = choose(unicode) + roman + choose(unicode); break;
      case 'metacharacter': input = choose(symbols) + roman + choose(symbols); break;
      case 'deletion': input = (roman + choose(syllables)).slice(0, 1 + random(roman.length)); break;
      case 'unknown': input = 'qz' + Array.from({ length: 1 + random(32) }, () => String.fromCharCode(97 + random(26))).join(''); break;
    }
    if (seen.has(input)) continue;
    seen.add(input);
    result.push({ id: `seed-${initialSeed}-${i}`, class: category, input, needles: [hira, word] });
    i++;
  }
  return result;
}

export const encodeJSONL = (rows) => rows.map((row) => JSON.stringify(row) + '\n').join('');
export function parseJSONL(source) {
  if (!source.endsWith('\n')) throw new Error('JSONL fixture must end with LF');
  return source.slice(0, -1).split('\n').map((line) => JSON.parse(line));
}

export function documentsFor(testCase, baseDocuments) {
  const needles = [...new Set([testCase.input, ...(testCase.needles ?? [])])];
  return [...baseDocuments, ...needles.flatMap((s) => [s, `${s}〈後〉`, `〈前〉${s}`, `〈前〉${s}〈後〉`])];
}
