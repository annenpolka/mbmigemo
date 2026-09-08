/** Nearest-rank percentiles; keep individual measurements in the raw receipt. */
export function distribution(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Expected nonempty, finite, nonnegative timing samples');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const at = (percentile) => sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
  return { count: sorted.length, min: sorted[0], median: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1), zeroCount: sorted.filter((v) => v === 0).length };
}

/** Frozen PLAN M5 rule. Failed/missing measurements cannot become a pass. */
export function adoptionDecision({ browsers, runs, codeBrotliBytes, pairs }) {
  if (!Array.isArray(browsers) || !browsers.length || new Set(browsers).size !== browsers.length) throw new Error('Expected unique browser names');
  if (!Number.isInteger(runs) || runs < 1) throw new Error('Expected a positive run count');
  const finitePositive = (value) => Number.isFinite(value) && value > 0;
  if (!finitePositive(codeBrotliBytes?.js) || !finitePositive(codeBrotliBytes?.['wasm-gc'])) throw new Error('Expected positive code sizes');
  const sizeRatio = codeBrotliBytes['wasm-gc'] / codeBrotliBytes.js;
  const sizePass = codeBrotliBytes['wasm-gc'] <= codeBrotliBytes.js * 0.8;
  const expectedKeys = new Set(browsers.flatMap((browser) => Array.from({ length: runs }, (_, run) => `${browser}:${run + 1}`)));
  const seen = new Set();
  const results = pairs.map((pair) => {
    const key = `${pair.browser}:${pair.run}`;
    if (seen.has(key) || !expectedKeys.has(key)) throw new Error(`Unexpected or duplicate measurement: ${key}`);
    seen.add(key);
    const compatibility = ['js', 'wasm-gc'].every((backend) => pair[backend]?.compatibility === true);
    const measurementsValid = ['js', 'wasm-gc'].every((backend) => finitePositive(pair[backend]?.firstResponseMs) && finitePositive(pair[backend]?.queryP95Ms));
    const valid = compatibility && measurementsValid;
    const firstResponseRatio = valid ? pair['wasm-gc'].firstResponseMs / pair.js.firstResponseMs : null;
    const queryP95Ratio = valid ? pair['wasm-gc'].queryP95Ms / pair.js.queryP95Ms : null;
    const latencyPass = valid && pair['wasm-gc'].firstResponseMs <= pair.js.firstResponseMs * 1.1;
    const queryPass = valid && pair['wasm-gc'].queryP95Ms <= pair.js.queryP95Ms * 0.8;
    return { browser: pair.browser, run: pair.run, compatibility, measurementsValid, firstResponseRatio, queryP95Ratio,
      sizePass, queryPass, latencyPass, pass: valid && latencyPass && (sizePass || queryPass) };
  });
  const complete = runs >= 3 && seen.size === expectedKeys.size;
  const eligible = complete && results.every((result) => result.pass);
  return { rule: 'compatibility AND (code Brotli <= 80% OR query p95 <= 80%) AND first response after dictionary fetch <= 110%, on every independent run (at least 3) in every measured browser',
    complete, eligible, recommendation: eligible ? 'wasm-gc-eligible-in-measured-environments' : 'retain-js-default',
    codeBrotliRatio: sizeRatio, missing: [...expectedKeys].filter((key) => !seen.has(key)), results };
}
