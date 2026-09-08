const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Bind the >=10k compatibility prerequisite to the code/data being measured. */
export function compatibilityEligibility(report, expected) {
  const require = (condition, message) => { if (!condition) throw new Error(`Benchmark compatibility prerequisite: ${message}`); };
  require(report?.status === 'passed' && Array.isArray(report.results), 'a completed passing report is required');
  for (const name of ['index.js', 'core.js', 'core.wasm', 'feature-bytes.js']) {
    const hash = expected.artifactSha256?.[name];
    require(digest(hash) && report.artifacts?.files?.[name] === hash, `artifact SHA differs: ${name}`);
  }
  for (const key of ['name', 'version', 'commit', 'sha256', 'flags', 'tables', 'operators']) {
    require(JSON.stringify(report.reference?.[key]) === JSON.stringify(expected.reference[key]), `reference differs: ${key}`);
  }
  const results = ['js', 'wasm-gc'].map((backend) => {
    const found = report.results.filter((entry) => entry.fixture === 'practical' && entry.backend === backend);
    require(found.length === 1, `exactly one practical/${backend} lane is required`);
    const lane = found[0];
    require(Number.isInteger(lane.inputs) && lane.inputs >= 10_000, `${backend} requires at least 10000 distinct inputs`);
    require(Number.isInteger(lane.cases) && lane.cases >= lane.inputs, `${backend} has inconsistent case counts`);
    require(Number.isInteger(lane.comparisons) && lane.comparisons >= lane.inputs, `${backend} has insufficient document comparisons`);
    require(lane.mismatches === 0 && Array.isArray(lane.failures) && lane.failures.length === 0, `${backend} contains failures`);
    for (const [field, value] of Object.entries({ sha256: expected.dictionarySha256, sourceSha256: expected.sourceSha256 })) {
      require(digest(value) && lane.dictionary?.[field] === value, `${backend} dictionary ${field} differs`);
    }
    for (const field of ['inputSha256', 'documentsSha256']) {
      require(digest(expected[field]) && lane[field] === expected[field], `${backend} ${field} differs from the current full corpus`);
    }
    return { backend, inputs: lane.inputs, cases: lane.cases, comparisons: lane.comparisons, mismatches: 0,
      inputSha256: lane.inputSha256, documentsSha256: lane.documentsSha256, corpus: lane.corpus };
  });
  return { status: 'verified', minimumDistinctInputsPerBackend: 10_000,
    artifactSha256: expected.artifactSha256, dictionarySha256: expected.dictionarySha256,
    sourceSha256: expected.sourceSha256, reference: expected.reference, results };
}
