import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { path, options, atomicWrite, encodeJSON, sha256 } from './lib/common.mjs';
import { loadFixtures } from './lib/fixtures.mjs';
import { loadDictionary } from './lib/dictionary.mjs';
import { referencePatterns } from './lib/reference.mjs';
import { compareQueries } from './lib/compare.mjs';
import { documentsFor } from './lib/corpus.mjs';

const args = options(process.argv.slice(2), ['--fixture', '--backend', '--module', '--cases', '--report']);
const fixture = args['--fixture'] ?? 'tiny';
if (!['tiny', 'practical', 'all'].includes(fixture)) throw new Error(`unsupported fixture: ${fixture}`);
const backend = args['--backend'] ?? 'both';
if (!['js', 'wasm-gc', 'both'].includes(backend)) throw new Error(`unsupported backend: ${backend}`);
const suite = args['--cases'] ?? 'all';
if (!['manual', 'all'].includes(suite)) throw new Error(`unsupported cases: ${suite}`);
const reportPath = path(args['--report'] ?? 'test-results/compat.json');
const report = { status: 'failed', results: [] };
try {
  const modulePath = path(args['--module'] ?? 'packages/mbmigemo/dist/index.js');
  const artifactFiles = args['--module'] ? [modulePath] : ['index.js', 'core.js', 'core.wasm', 'feature-bytes.js'].map(name => join(dirname(modulePath), name));
  let module;
  try { module = await import(pathToFileURL(modulePath)); }
  catch (error) {
    throw new Error(`Cannot load the implementation: ${modulePath}. Build the real API first, or pass --module PATH exporting createMigemo. No tests were skipped.`, { cause: error });
  }
  report.artifacts = { entrypoint: modulePath, files: Object.fromEntries(await Promise.all(artifactFiles.map(async file => [file.slice(dirname(modulePath).length + 1), sha256(await readFile(file))]))) };
  if (typeof module.createMigemo !== 'function') throw new Error('implementation must export createMigemo');
  const fixtures = await loadFixtures();
  Object.assign(report, { reference: fixtures.manifest.reference, fixture, seed: fixtures.manifest.seed });
  for (const dictionary of fixture === 'all' ? ['tiny', 'practical'] : [fixture]) {
    let cases = suite === 'manual' ? fixtures.manual : fixtures.cases;
    let metadata, corpus;
    if (dictionary === 'practical') {
      const { loadPracticalDictionaryMetadata } = await import('./lib/practical-dictionary.mjs');
      const { practicalCases } = await import('./lib/practical-corpus.mjs');
      metadata = await loadPracticalDictionaryMetadata();
      ({ cases, corpus } = await practicalCases(fixtures, metadata, suite));
    }
    console.log(`Comparing ${dictionary}: ${cases.length} cases against pinned C/Migemo`);
    const inputSha256 = sha256(encodeJSON(cases));
    const documentsSha256 = sha256(encodeJSON(fixtures.documents));
    const patterns = await referencePatterns(cases.map((c) => c.input), dictionary);
    for (const target of backend === 'both' ? ['js', 'wasm-gc'] : [backend]) {
      const migemo = await module.createMigemo({ dictionary: await loadDictionary(dictionary), backend: target });
      if (migemo.backend !== target) throw new Error(`requested ${target}, got ${migemo.backend}`);
      const result = compareQueries(cases, patterns, (s) => migemo.query(s), fixtures.documents, documentsFor, dictionary === 'practical' ? ({completed, total}) => console.log(`  ${target}: ${completed}/${total}`) : undefined);
      report.results.push({ fixture: dictionary, backend: target, inputSha256, documentsSha256, ...(metadata ? { dictionary: metadata, corpus } : {}), ...result });
      console.log(`${dictionary}/${target}: cases=${result.cases}, inputs=${result.inputs}, comparisons=${result.comparisons}, mismatches=${result.mismatches}, patternDifferences=${result.patternDifferences}`);
      // Save each completed lane so long runs retain their validated progress.
      await atomicWrite(reportPath, encodeJSON(report));
    }
  }
  for (const file of artifactFiles) {
    const name = file.slice(dirname(modulePath).length + 1);
    if (sha256(await readFile(file)) !== report.artifacts.files[name]) throw new Error(`Implementation artifact changed during comparison: ${name}`);
  }
  report.status = report.results.some((result) => result.mismatches) ? 'failed' : 'passed';
} catch (error) {
  report.error = String(error);
  console.error(error);
} finally {
  await atomicWrite(reportPath, encodeJSON(report));
}
if (report.status !== 'passed') process.exitCode = 1;
