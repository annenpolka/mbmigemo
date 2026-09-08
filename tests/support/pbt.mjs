import test from 'node:test';
import fc from 'fast-check';
import { path, atomicWrite, encodeJSON } from '../../scripts/lib/common.mjs';

export function parametersFromEnv(env = process.env) {
  const integer = (value, fallback, min, max, label) => {
    if (value === undefined) return fallback;
    if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
      throw new Error(`Invalid ${label}: ${value}`);
    }
    return Number(value);
  };
  if (env.PBT_PATH !== undefined && (!env.PBT_PROPERTY || env.PBT_SEED === undefined)) {
    throw new Error('PBT_PATH requires PBT_PROPERTY and PBT_SEED so replay selects exactly one property');
  }
  return {
    seed: integer(env.PBT_SEED, 20260908, -2147483648, 2147483647, 'PBT_SEED'),
    numRuns: integer(env.PBT_RUNS, 500, 1, 100_000, 'PBT_RUNS'),
    ...(env.PBT_PATH !== undefined ? { path: env.PBT_PATH } : {}),
    randomType: 'xoroshiro128plus',
    markInterruptAsFailure: true,
  };
}

export async function checkProperty(name, property, parameters, reportDirectory = path('test-results/pbt')) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid property name: ${name}`);
  const result = await fc.check(property, parameters);
  const report = {
    property: name, fastCheckVersion: fc.__version, status: result.failed ? 'failed' : 'passed',
    seed: result.seed, path: result.counterexamplePath, requestedRuns: parameters.numRuns,
    runs: result.numRuns, shrinks: result.numShrinks, skips: result.numSkips,
    interrupted: result.interrupted,
    counterexample: result.failed ? fc.stringify(result.counterexample) : null,
    error: result.errorInstance ? String(result.errorInstance) : null,
  };
  // Overwrite this property's last receipt on success too, avoiding stale failure.
  await atomicWrite(`${reportDirectory}/${name}.json`, encodeJSON(report));
  if (result.failed) {
    throw new Error(`PBT ${name} failed: seed=${result.seed}, path=${result.counterexamplePath}, shrinks=${result.numShrinks}\nCounterexample: ${report.counterexample}\nReplay with PBT_PROPERTY=${name} PBT_SEED=${result.seed} PBT_PATH='${result.counterexamplePath}' and the same suite command.`, { cause: result.errorInstance });
  }
  return report;
}

export function registerProperties(properties) {
  const selected = process.env.PBT_PROPERTY;
  if (selected !== undefined && !Object.hasOwn(properties, selected)) throw new Error(`Unknown PBT_PROPERTY: ${selected}. Available: ${Object.keys(properties).join(', ')}`);
  const parameters = parametersFromEnv();
  for (const [name, property] of Object.entries(properties)) {
    if (selected !== undefined && selected !== name) continue;
    test(`PBT ${name}`, async () => { await checkProperty(name, property, parameters); });
  }
}
