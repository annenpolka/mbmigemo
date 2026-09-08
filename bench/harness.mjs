const now = () => performance.now();
function memory() {
  const heap = performance.memory;
  return heap ? { method: 'performance.memory (nonstandard JS heap observation, no forced GC)', usedJSHeapSize: heap.usedJSHeapSize, totalJSHeapSize: heap.totalJSHeapSize, jsHeapSizeLimit: heap.jsHeapSizeLimit }
    : { method: 'unavailable', reason: 'This browser exposes no performance.memory; no portable per-library memory API is assumed.' };
}
function environment() {
  let previous = now(); let resolution = Infinity;
  for (let i = 0; i < 10_000; i++) {
    const current = now(); if (current > previous) resolution = Math.min(resolution, current - previous); previous = current;
  }
  return { userAgent: navigator.userAgent, crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency,
    observedTimerStepMs: Number.isFinite(resolution) ? resolution : null };
}
function resources() {
  return performance.getEntriesByType('resource').map((entry) => ({ name: new URL(entry.name).pathname, durationMs: entry.duration,
    transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize }));
}
async function dictionary(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Dictionary HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
const matches = (regex, documents) => documents.map((document) => regex.test(document));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

window.runBenchmark = async ({ backend, dictionaryUrl, workload, warmup, rounds }) => {
  const observations = { before: memory() };
  const start = now();
  const bytes = await dictionary(dictionaryUrl);
  const fetched = now();
  const { createMigemo } = await import('/packages/mbmigemo/dist/index.js');
  const wrapperLoaded = now();
  let migemo;
  try { migemo = await createMigemo({ dictionary: bytes, backend }); }
  catch (error) {
    return { backend, status: error.code === 'UnsupportedBackend' ? 'unsupported' : 'error', error: { name: error.name, code: error.code, message: error.message }, environment: environment(), resources: resources() };
  }
  const initialized = now();
  const firstPattern = migemo.query(workload.cases[0].input);
  const firstQuery = now();
  const firstRegex = new RegExp(firstPattern, 'u');
  const firstCompiled = now();
  const firstMatches = matches(firstRegex, workload.documents);
  const firstResponse = now();
  if (migemo.backend !== backend) throw new Error(`Requested ${backend}, got ${migemo.backend}`);
  observations.afterInitializationAndFirstResponse = memory();
  const patternLengths = [];
  const patterns = [];
  // Check the full timed workload against C before any warm timing is accepted.
  for (const [index, entry] of workload.cases.entries()) {
    const pattern = index === 0 ? firstPattern : migemo.query(entry.input);
    const actual = index === 0 ? firstMatches : matches(new RegExp(pattern, 'u'), workload.documents);
    if (!equal(actual, entry.expected)) {
      const differences = workload.documents.flatMap((document, index) => actual[index] === entry.expected[index] ? []
        : [{ document, expected: entry.expected[index], actual: actual[index] }]);
      throw new Error(`C/Migemo match difference: ${entry.id} ${JSON.stringify(entry.input)}; ${JSON.stringify(differences.slice(0, 5))}; pattern length ${pattern.length}`);
    }
    patterns.push(pattern); patternLengths.push(pattern.length);
  }
  let sink = 0;
  const execute = (index, measure) => {
    const beforeQuery = now();
    const pattern = migemo.query(workload.cases[index].input);
    const afterQuery = now();
    const regex = new RegExp(pattern, 'u');
    const afterCompile = now();
    let matched = 0;
    for (const document of workload.documents) if (regex.test(document)) matched++;
    const afterMatch = now();
    sink += matched + pattern.length;
    if (pattern !== patterns[index]) throw new Error(`Nondeterministic output: ${workload.cases[index].id}`);
    return measure ? { caseIndex: index, queryMs: afterQuery - beforeQuery, regexCompileMs: afterCompile - afterQuery, matchMs: afterMatch - afterCompile, totalMs: afterMatch - beforeQuery } : null;
  };
  for (let round = 0; round < warmup; round++) for (let index = 0; index < workload.cases.length; index++) execute(index, false);
  const samples = [];
  for (let round = 0; round < rounds; round++) {
    for (let position = 0; position < workload.cases.length; position++) {
      // Same rotation in each backend; avoid always assigning one case to a boundary.
      const index = (position + round * 17) % workload.cases.length;
      samples.push({ round: round + 1, ...execute(index, true) });
    }
  }
  observations.afterQueries = memory();
  return { backend, status: 'ok', compatibility: true, environment: environment(), dictionaryBytes: bytes.length,
    cold: { dictionaryFetchMs: fetched - start, wrapperLoadMs: wrapperLoaded - fetched,
      coreLoadCompileAndInitializeMs: initialized - wrapperLoaded, initializeThroughPublicApiMs: initialized - wrapperLoaded,
      firstQueryMs: firstQuery - initialized, firstRegexCompileMs: firstCompiled - firstQuery,
      firstMatchMs: firstResponse - firstCompiled, firstResponseAfterDictionaryFetchMs: firstResponse - fetched,
      fetchToFirstResponseMs: firstResponse - start },
    patternLengths, samples, sink, memory: observations, resources: resources() };
};

// A separate fresh process diagnoses cold compile and dictionary materialization.
// This mirrors the public byte transport explicitly; public API timings above
// remain the adoption criterion and include the feature probe and all copying.
window.runDiagnostic = async ({ backend, dictionaryUrl }) => {
  const bytes = await dictionary(dictionaryUrl);
  const before = memory();
  let core, loadMs, compileMs = null;
  if (backend === 'js') {
    const start = now(); core = await import('/packages/mbmigemo/dist/core.js'); loadMs = now() - start;
  } else {
    const start = now();
    const response = await fetch('/packages/mbmigemo/dist/core.wasm', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Core HTTP ${response.status}`);
    const wasm = await response.arrayBuffer(); loadMs = now() - start;
    const compileStart = now();
    core = (await WebAssembly.instantiate(wasm, {}, { builtins: ['js-string'], importedStringConstants: '_' })).instance.exports;
    compileMs = now() - compileStart;
  }
  const start = now();
  const snapshot = new Uint8Array(bytes);
  let instance;
  if (backend === 'js') instance = core.initialize(snapshot);
  else {
    const chunks = [];
    for (let offset = 0; offset < snapshot.length; offset += 8192) chunks.push(String.fromCharCode(...snapshot.subarray(offset, offset + 8192)));
    instance = core.initialize_latin1(chunks.join(''));
  }
  const dictionaryInitializationMs = now() - start;
  if (!core.is_valid(instance)) throw new Error('Diagnostic initialization rejected dictionary');
  const check = new RegExp(core.query(instance, 'kensaku'), 'u').test('検索');
  if (!check) throw new Error('Diagnostic search did not match 検索');
  return { backend, loadMs, compileMs, dictionaryInitializationMs, environment: environment(),
    memory: { before, afterInitialization: memory() }, resources: resources(),
    method: backend === 'js' ? 'JS dynamic import combines network, parse, compile and module evaluation; these are not separately exposed.'
      : 'Wasm fetch and WebAssembly.instantiate measured separately; instantiate includes compile and module instantiation. Dictionary init includes the public snapshot and Latin-1 transport, but feature detection is excluded from this diagnostic.' };
};
