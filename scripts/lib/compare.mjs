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

export function compareQueries(cases, patterns, query, baseDocuments, documentsFor) {
  if (!cases.length || cases.length !== patterns.length) throw new Error('nonempty aligned cases and oracle patterns are required');
  const failures = [];
  let comparisons = 0, patternDifferences = 0;
  for (let i = 0; i < cases.length; i++) {
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
    if (actual !== expected) patternDifferences++;
    const failure = compareCase(c, expected, actual, documents);
    if (failure) failures.push(failure);
  }
  return { cases: cases.length, inputs: new Set(cases.map((c) => c.input)).size, comparisons, patternDifferences, mismatches: failures.length, failures };
}
