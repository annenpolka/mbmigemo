import { pathToFileURL } from 'node:url';
import { path, options, atomicWrite, encodeJSON } from './lib/common.mjs';
import { loadFixtures } from './lib/fixtures.mjs';
import { loadDictionary } from './lib/dictionary.mjs';
import { referencePatterns } from './lib/reference.mjs';
import { compareQueries } from './lib/compare.mjs';
import { documentsFor } from './lib/corpus.mjs';

const args = options(process.argv.slice(2), ['--fixture', '--backend', '--module', '--cases', '--report']);
if ((args['--fixture'] ?? 'tiny') !== 'tiny') throw new Error('Only --fixture tiny is available; practical dictionary is not pinned yet.');
const backend = args['--backend'] ?? 'both';
if (!['js', 'wasm-gc', 'both'].includes(backend)) throw new Error(`unsupported backend: ${backend}`);
const suite = args['--cases'] ?? 'all';
if (!['manual', 'all'].includes(suite)) throw new Error(`unsupported cases: ${suite}`);
const reportPath = path(args['--report'] ?? 'test-results/compat.json');
const report = { status: 'failed', results: [] };
try {
  const modulePath = path(args['--module'] ?? 'packages/mbmigemo/dist/index.js');
  let module;
  try { module = await import(pathToFileURL(modulePath)); }
  catch (error) {
    throw new Error(`Cannot load the implementation: ${modulePath}. Build the real API first, or pass --module PATH exporting createMigemo. No tests were skipped.`, { cause: error });
  }
  if (typeof module.createMigemo !== 'function') throw new Error('implementation must export createMigemo');
  const fixtures = await loadFixtures();
  const cases = suite === 'manual' ? fixtures.manual : fixtures.cases;
  const patterns = await referencePatterns(cases.map((c) => c.input));
  Object.assign(report, { reference: fixtures.manifest.reference, fixture: 'tiny', seed: fixtures.manifest.seed });
  for (const target of backend === 'both' ? ['js', 'wasm-gc'] : [backend]) {
    const migemo = await module.createMigemo({ dictionary: await loadDictionary(), backend: target });
    if (migemo.backend !== target) throw new Error(`requested ${target}, got ${migemo.backend}`);
    const result = compareQueries(cases, patterns, (s) => migemo.query(s), fixtures.documents, documentsFor);
    report.results.push({ backend: target, ...result });
    console.log(`${target}: cases=${result.cases}, inputs=${result.inputs}, comparisons=${result.comparisons}, mismatches=${result.mismatches}, patternDifferences=${result.patternDifferences}`);
  }
  report.status = report.results.some((result) => result.mismatches) ? 'failed' : 'passed';
} catch (error) {
  report.error = String(error);
  console.error(error);
} finally {
  await atomicWrite(reportPath, encodeJSON(report));
}
if (report.status !== 'passed') process.exitCode = 1;
