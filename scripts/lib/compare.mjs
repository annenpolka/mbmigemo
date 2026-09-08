export function compareCase(testCase, expectedPattern, actualPattern, documents) {
  const context = { id: testCase.id, class: testCase.class, input: testCase.input, flags: 'u', expectedPattern, actualPattern,
    expectedLength: expectedPattern.length, actualLength: typeof actualPattern === 'string' ? actualPattern.length : null };
  // A bad oracle is a harness error, never an implementation mismatch.
  const expected = new RegExp(expectedPattern, 'u');
  let actual;
  try {
    if (typeof actualPattern !== 'string') throw new TypeError('query must return a string synchronously');
    actual = new RegExp(actualPattern, 'u');
  } catch (error) { return { ...context, kind: 'invalid-pattern', error: error.message }; }
  const missing = [], extra = [];
  for (let index = 0; index < documents.length; index++) {
    const document = documents[index];
    const wanted = expected.test(document), got = actual.test(document);
    if (wanted && !got) missing.push({ index, document });
    if (!wanted && got) extra.push({ index, document });
  }
  if (missing.length || extra.length) return { ...context, kind: 'match-set', missing, extra };
  return null;
}

export function compareQueries(cases, patterns, query, baseDocuments, documentsFor, onProgress) {
  if (!cases.length || cases.length !== patterns.length) throw new Error('nonempty aligned cases and oracle patterns are required');
  const failures = [];
  let comparisons = 0, patternDifferences = 0;
  let maxExpectedPatternLength = 0, maxActualPatternLength = 0;
  for (let i = 0; i < cases.length; i++) {
    if (i % 1000 === 0) onProgress?.({ completed: i, total: cases.length });
    const c = cases[i];
    const expected = patterns[i].pattern;
    const documents = documentsFor(c, baseDocuments);
    comparisons += documents.length;
    let actual;
    try { actual = query(c.input); }
    catch (error) {
      failures.push({ id: c.id, class: c.class, input: c.input, kind: 'query-error', error: String(error), expectedPattern: expected });
      continue;
    }
    maxExpectedPatternLength = Math.max(maxExpectedPatternLength, expected.length);
    maxActualPatternLength = Math.max(maxActualPatternLength, typeof actual === 'string' ? actual.length : 0);
    if (actual !== expected) patternDifferences++;
    const failure = compareCase(c, expected, actual, documents);
    if (failure) failures.push(failure);
  }
  onProgress?.({ completed: cases.length, total: cases.length });
  return { maxExpectedPatternLength, maxActualPatternLength, cases: cases.length, inputs: new Set(cases.map((c) => c.input)).size, comparisons, patternDifferences, mismatches: failures.length, failures };
}
