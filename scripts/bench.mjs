import os from 'node:os';
import { relative } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { path, json, sha256, atomicWrite, encodeJSON, options, run } from './lib/common.mjs';
import { referencePatterns } from './lib/reference.mjs';
import { loadDictionary } from './lib/dictionary.mjs';
import { startServer } from './lib/server.mjs';
import { sizeReport } from './size.mjs';
import { adoptionDecision, distribution } from '../bench/decision.mjs';
import { compatibilityEligibility } from '../bench/provenance.mjs';

const args = options(process.argv.slice(2), ['--fixture', '--browsers', '--runs', '--warmup', '--rounds', '--output', '--summary', '--compat-report']);
if (args['--summary'] && !args['--summary'].endsWith('.md')) throw new Error('--summary must be a Markdown (.md) file');
const fixture = args['--fixture'] ?? 'practical';
if (!['tiny', 'practical'].includes(fixture)) throw new Error('Benchmark fixture must be tiny or practical');
const browsers = (args['--browsers'] ?? 'chromium,firefox,webkit').split(',');
if (!browsers.length || new Set(browsers).size !== browsers.length || browsers.some((name) => !['chromium', 'firefox', 'webkit'].includes(name))) throw new Error('Expected unique comma-separated Playwright browser names');
const integer = (key, fallback, max) => {
  const value = args[key] ?? String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw new Error(`${key} must be an integer from 1 to ${max}`);
  return Number(value);
};
const runs = integer('--runs', 3, 20);
const warmup = integer('--warmup', 2, 100);
const rounds = integer('--rounds', 5, 100);
const started = new Date().toISOString();
const output = path(args['--output'] ?? `bench/results/${started.replaceAll(':', '-')}`);
await mkdir(output, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path('.cache/ms-playwright');
const playwright = await import('playwright');
const dictionary = await loadDictionary(fixture);
const sizes = await sizeReport(fixture);
const cases = await json(path('tests/fixtures/cases.json'));
if (fixture === 'practical') cases.push(...await json(path('tests/practical/cases.json')));
const baseDocuments = await json(path('tests/fixtures/documents.json'));
let source;
let referenceEligibility = { status: 'exempt-tiny-smoke', eligibleForAdoption: false };
if (fixture === 'practical') {
  const { loadPracticalDictionaryMetadata } = await import('./lib/practical-dictionary.mjs');
  const metadata = await loadPracticalDictionaryMetadata();
  source = metadata.source;
  const { loadFixtures } = await import('./lib/fixtures.mjs');
  const { practicalCases } = await import('./lib/practical-corpus.mjs');
  const fixtures = await loadFixtures();
  const fullCorpus = await practicalCases(fixtures, metadata, 'all');
  const reportPath = path(args['--compat-report'] ?? 'test-results/compat.json');
  let reportBytes;
  try { reportBytes = await readFile(reportPath); }
  catch (cause) { throw new Error('A full practical compatibility report is required. Run npm run test:practical before benchmarking.', { cause }); }
  referenceEligibility = { ...compatibilityEligibility(JSON.parse(reportBytes), {
    artifactSha256: Object.fromEntries(Object.entries(sizes.files).map(([name, info]) => [name, info.sha256])),
    dictionarySha256: metadata.sha256, sourceSha256: metadata.sourceSha256,
    inputSha256: sha256(encodeJSON(fullCorpus.cases)), documentsSha256: sha256(encodeJSON(fixtures.documents)), reference: fixtures.manifest.reference,
  }), report: relative(path(''), reportPath), reportSha256: sha256(reportBytes) };
} else source = 'tests/fixtures/tiny-dict.tsv';
const rows = (await readFile(path(source), 'utf8')).trimEnd().split('\n');
const sampledValues = Array.from({ length: Math.min(128, rows.length) }, (_, index) => rows[Math.floor(index * rows.length / Math.min(128, rows.length))].split('\t').slice(1)).flat();
const regressionDocuments = cases.flatMap((entry) => (entry.needles ?? []).flatMap((needle) => [needle, `前${needle}後`, `${needle}末尾`, `先頭${needle}`]));
const documents = [...new Set([...baseDocuments, ...sampledValues, ...cases.map((entry) => entry.input), ...regressionDocuments])];
const oracle = await referencePatterns(cases.map((entry) => entry.input), fixture);
const workload = { cases: cases.map((entry, index) => {
  const regex = new RegExp(oracle[index].pattern, 'u');
  return { ...entry, expected: documents.map((document) => regex.test(document)),
    referencePatternLength: oracle[index].pattern.length, referencePatternSha256: sha256(oracle[index].pattern) };
}), documents };
const workloadHash = sha256(encodeJSON(workload));
await atomicWrite(`${output}/workload.json`, encodeJSON(workload));
const sources = {};
for (const name of ['scripts/bench.mjs', 'scripts/size.mjs', 'bench/harness.html', 'bench/harness.mjs', 'bench/decision.mjs', 'bench/provenance.mjs', 'scripts/lib/server.mjs']) sources[name] = sha256(await readFile(path(name)));
const receipt = { schema: 1, started, fixture, environment: { cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
  os: `${os.platform()} ${os.release()} ${os.arch()}`, systemMemoryBytes: os.totalmem(), node: process.version, npm: run('npm', ['--version']).trim(),
  playwright: (await json(path('node_modules/playwright/package.json'))).version, sdk: await json(path('tests/moon/toolchain.json')),
  gitHead: run('git', ['rev-parse', 'HEAD']).trim(), trackedChanges: Boolean(run('git', ['status', '--porcelain', '--untracked-files=no']).trim()) },
  protocol: { browsers, runs, warmup, rounds, execution: 'serial, separate fresh browser process per backend/public trial and separate fresh process for each diagnostic; alternate backend order between repetitions',
    network: 'uncompressed no-store HTTP on loopback; no network throttling; cold browser cache, potentially warm OS filesystem cache',
    timing: 'performance.now around each individual call; nearest-rank percentiles over all equally weighted fixed cases and repetitions; zero-resolution samples retained',
    firstResponse: 'Dictionary fetch starts after harness navigation. Startup after dictionary fetch includes wrapper import, feature detection if selected, core loading/compile, snapshot/transport, init, first kensaku query, RegExp construction, and all document matches.',
    regex: 'new RegExp(pattern, u) constructor time measured separately from first test and document matching; engines may cache compilation and defer work to test()',
    memory: 'performance.memory observations where available; no forced GC, no process RSS or total Wasm GC attribution. Values are not comparable across browsers and are not an adoption criterion.' },
  workload: { sha256: workloadHash, cases: cases.length, documents: documents.length, classes: [...new Set(cases.map((entry) => entry.class))],
    dictionarySha256: sha256(dictionary), sourceSha256: sha256(await readFile(path(source))), oracle: await json(path('tests/reference/lock.json')) },
  benchmarkSourceSha256: sources, referenceEligibility, sizes, measurements: [] };

const server = await startServer({ port: 0, dictionary: fixture });
async function inBrowser(name, fn) {
  // Chromium's precise heap accounting only improves this browser's own
  // performance.memory observation. No exposure of GC or forced collection.
  const browser = await playwright[name].launch({ headless: true, ...(name === 'chromium' ? { args: ['--enable-precise-memory-info'] } : {}) });
  try {
    const version = browser.version();
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(180_000);
    await page.goto(`${server.url}/bench/harness.html`);
    await page.waitForFunction(() => typeof window.runBenchmark === 'function');
    let timer;
    try {
      const result = await Promise.race([fn(page), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${name}: benchmark phase exceeded 180 seconds`)), 180_000);
      })]);
      return { browserVersion: version, ...result };
    } finally { clearTimeout(timer); }
  } finally { await browser.close(); }
}

try {
  for (const browser of browsers) {
    for (let repetition = 1; repetition <= runs; repetition++) {
      const order = repetition % 2 === 1 ? ['js', 'wasm-gc'] : ['wasm-gc', 'js'];
      for (const backend of order) {
        for (const [name, info] of Object.entries(sizes.files)) {
          if (sha256(await readFile(path(`packages/mbmigemo/dist/${name}`))) !== info.sha256) throw new Error(`Build changed during measurement: ${name}`);
        }
        console.log(`${browser} run ${repetition}/${runs} ${backend}: public API cold + warm workload`);
        const config = { backend, dictionaryUrl: `/dictionaries/${fixture}.compact`, workload, warmup, rounds };
        const measurement = { browser, run: repetition, ...await inBrowser(browser, (page) => page.evaluate((value) => window.runBenchmark(value), config)) };
        if (measurement.status === 'error') throw new Error(`${browser}/${backend}: ${JSON.stringify(measurement.error)}`);
        if (measurement.status === 'ok') {
          measurement.summary = Object.fromEntries(['queryMs', 'regexCompileMs', 'matchMs', 'totalMs'].map((field) => [field, distribution(measurement.samples.map((sample) => sample[field]))]));
          measurement.diagnostic = await inBrowser(browser, (page) => page.evaluate((value) => window.runDiagnostic(value), { backend, dictionaryUrl: config.dictionaryUrl }));
          console.log(`  p95 query ${measurement.summary.queryMs.p95.toFixed(3)} ms; first response after dictionary fetch ${measurement.cold.firstResponseAfterDictionaryFetchMs.toFixed(3)} ms`);
        } else console.log(`  ${measurement.status}: ${measurement.error?.code}`);
        receipt.measurements.push(measurement);
        await atomicWrite(`${output}/raw.json`, encodeJSON(receipt));
      }
    }
  }
} catch (error) {
  receipt.failure = { name: error.name, message: error.message };
  await atomicWrite(`${output}/raw.json`, encodeJSON(receipt));
  throw error;
} finally { await server.close(); }

const pairs = browsers.flatMap((browser) => Array.from({ length: runs }, (_, index) => {
  const pair = { browser, run: index + 1 };
  for (const backend of ['js', 'wasm-gc']) {
    const measurement = receipt.measurements.find((entry) => entry.browser === browser && entry.run === index + 1 && entry.backend === backend);
    pair[backend] = { compatibility: measurement?.compatibility === true,
      firstResponseMs: measurement?.cold?.firstResponseAfterDictionaryFetchMs, queryP95Ms: measurement?.summary?.queryMs.p95 };
  }
  return pair;
}));
receipt.decision = adoptionDecision({ browsers, runs, codeBrotliBytes: { js: sizes.backends.js.brotli, 'wasm-gc': sizes.backends['wasm-gc'].brotli }, pairs });
if (fixture === 'tiny') {
  receipt.decision.eligible = false;
  receipt.decision.recommendation = 'smoke-only-no-adoption-decision';
}
for (const [name, expected] of Object.entries(sources)) {
  if (sha256(await readFile(path(name))) !== expected) throw new Error(`Benchmark source changed during measurement: ${name}`);
}
if (sha256(await loadDictionary(fixture)) !== receipt.workload.dictionarySha256) throw new Error('Dictionary changed during measurement');
if (fixture === 'practical' && sha256(await readFile(path(referenceEligibility.report))) !== referenceEligibility.reportSha256) throw new Error('Compatibility report changed during measurement');
receipt.finished = new Date().toISOString();
await atomicWrite(`${output}/raw.json`, encodeJSON(receipt));
const summary = args['--summary'] ?? (fixture === 'practical' && runs >= 3 ? 'docs/benchmarks/baseline.md' : null);
if (summary) await atomicWrite(path(summary), markdown(receipt, output));
console.log(`Decision: ${receipt.decision.recommendation}. Raw receipt: ${output}/raw.json`);

function markdown(result, directory) {
  const fixed = (value) => value == null ? '—' : value.toFixed(3);
  const rows = result.measurements.map((entry) => entry.status !== 'ok'
    ? `| ${entry.browser} ${entry.browserVersion} | ${entry.run} | ${entry.backend} | ${entry.status} | — | — | — | — | — | — |`
    : `| ${entry.browser} ${entry.browserVersion} | ${entry.run} | ${entry.backend} | ${fixed(entry.cold.dictionaryFetchMs)} | ${fixed(entry.cold.firstResponseAfterDictionaryFetchMs)} | ${fixed(entry.summary.queryMs.median)} | ${fixed(entry.summary.queryMs.p95)} | ${fixed(entry.summary.queryMs.p99)} | ${fixed(entry.summary.regexCompileMs.p95)} | ${fixed(entry.summary.matchMs.p95)} |`);
  const diagnostics = result.measurements.filter((entry) => entry.status === 'ok').map((entry) => `| ${entry.browser} | ${entry.run} | ${entry.backend} | ${fixed(entry.diagnostic.loadMs)} | ${fixed(entry.diagnostic.compileMs)} | ${fixed(entry.diagnostic.dictionaryInitializationMs)} |`);
  const decisions = result.decision.results.map((entry) => `| ${entry.browser} | ${entry.run} | ${fixed(entry.firstResponseRatio)} | ${fixed(entry.queryP95Ratio)} | ${entry.pass ? 'pass' : 'retain JS'} |`);
  const sizeRows = Object.entries({ ...result.sizes.backends, dictionary: result.sizes.dictionary }).map(([name, entry]) => `| ${name} | ${entry.raw} | ${entry.gzip} | ${entry.brotli} |`);
  const memoryRows = result.measurements.filter((entry) => entry.status === 'ok').map((entry) => `| ${entry.browser} | ${entry.run} | ${entry.backend} | ${entry.memory.before.usedJSHeapSize ?? 'unavailable'} | ${entry.memory.afterInitializationAndFirstResponse.usedJSHeapSize ?? 'unavailable'} | ${entry.memory.afterQueries.usedJSHeapSize ?? 'unavailable'} |`);
  const limits = 'この測定は当該マシンのPlaywrightブラウザに限定される。WebKitはSafari実機の代替証拠ではない。localhostは非圧縮・遅延制御なしで、実回線のダウンロード時間を予測しない。JS dynamic importの取得・構文解析・コンパイル・module評価は分離できない。RegExpエンジンによるキャッシュと遅延コンパイルがあるため、constructor時間と照合時間を合わせて読む。メモリは非標準performance.memoryの観測値のみで、強制GCなし、Wasm GCを含む全プロセスメモリや辞書単独の保持量ではない。ブラウザ間のメモリ順位づけには使用しない。';
  return `# 実測ベースライン

測定日時: ${result.started} ～ ${result.finished}。結論: **${result.decision.recommendation}**。既定変更には測定対象環境の範囲と下記の制約も考慮する。

## 条件

- CPU: ${result.environment.cpu} (${result.environment.logicalCpus} logical CPUs)、OS: ${result.environment.os}、RAM: ${result.environment.systemMemoryBytes} bytes。
- Node: ${result.environment.node}、Playwright: ${result.environment.playwright}、moonc: ${result.environment.sdk.moonc}、core: ${result.environment.sdk.core}。
- Git HEAD: ${result.environment.gitHead}、tracked changes present: ${result.environment.trackedChanges}。実際のcode・harnessのSHAは下記のcompact receiptに保存。
- 辞書: ${result.fixture}、SHA-256: ${result.workload.dictionarySha256}。入力・期待値・文書のSHA-256: ${result.workload.sha256}。
- ${result.workload.cases}入力 × ${result.workload.documents}文書をC/Migemoと照合してから測定。クラス: ${result.workload.classes.join(', ')}。
- 大規模互換性の前提: ${result.referenceEligibility.status}。${result.referenceEligibility.report ?? 'tiny smoke exempt'}、report SHA-256: ${result.referenceEligibility.reportSha256 ?? 'not applicable'}。両版各10,000以上のdistinct入力の成功を、測定対象のcode・辞書・現在の入力/文書コーパスSHAへ結び付ける。
- 各版${runs}回の独立起動、各起動で${warmup}周warmup後に${rounds}周を測定。毎回ブラウザを新規プロセスで起動、版の順序を交互にし、処理を直列実行。
- 生データ: ${relative(path(''), directory)}/raw.json と workload.json（git除外）。再実行: npm run bench。手法の詳細は[methodology.md](methodology.md)。

## 容量（bytes）

各HTTP resourceを独立にgzip level 9／Brotli quality 11, generic, lgwin 22で圧縮し合算。JS版はindex.js+core.js、Wasm GC版はindex.js+feature-bytes.js+core.wasm。release出力の追加minifyは行わない。辞書、型定義、ライセンス、HTTP header、demoはcode合計に含めない。辞書は別行で両版共通。

| 対象 | raw | gzip | Brotli |
| --- | ---: | ---: | ---: |
${sizeRows.join('\n')}

## 公開API測定（ms）

初回応答は辞書取得完了後からwrapper import・コア取得/コンパイル・初期化・最初のkensaku展開・正規表現構築・文書照合の完了まで。取得開始からの総時間、各内訳、全サンプルとpattern長はreceiptに保存。warm percentileは個々の呼び出しを集計するnearest-rank。

| ブラウザ | run | 版 | 辞書取得 | 取得後初回応答 | query中央値 | query p95 | query p99 | RegExp構築 p95 | 照合 p95 |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

## コンパイルと辞書初期化の診断（ms）

公開API測定とは別の新規ブラウザプロセスで低水準exportsを呼ぶ補助測定。辞書初期化はUint8Array snapshotと、Wasmの場合Latin-1文字列転送を含む。JSのloadは取得/parse/compile/module評価の合計。WasmのcompileはWebAssembly.instantiate（コンパイルとinstance生成）でfeature probeを除外する。採用判断には公開APIの初回応答を用いる。

| ブラウザ | run | 版 | コアload | Wasm compile+instantiate | 辞書初期化 |
| --- | ---: | --- | ---: | ---: | ---: |
${diagnostics.join('\n')}

## メモリ観測（bytes）

performance.memory.usedJSHeapSizeの全ページ観測。回収時点・一時オブジェクト・エンジン内部の表現が混ざる。各版の保持辞書サイズやWasm GCの総量と解釈しない。Chromiumでは--enable-precise-memory-infoを使用し、GCを強制しない。

| ブラウザ | run | 版 | 取得前 | 初期化・初回応答後 | 全query後 |
| --- | ---: | --- | ---: | ---: | ---: |
${memoryRows.join('\n')}

## 採用基準

${result.decision.rule}。code Brotli比は${fixed(result.decision.codeBrotliRatio)}（Wasm/JS）。各独立起動で全条件を満たした場合だけ候補とする。性能の良かった一回や平均値で失敗を相殺しない。

| ブラウザ | run | 取得後初回応答比 Wasm/JS | query p95比 Wasm/JS | 判断 |
| --- | ---: | ---: | ---: | --- |
${decisions.join('\n')}

## 制約

${limits}

機械可読の[baseline.json](baseline.json)に環境・設定・サマリー・サイズとcode/harness SHAを記録する。全ての有限テストの成功は全入力の意味同値の証明ではない。
`;
}

// Keep all independent-run summaries and provenance reviewable without adding
// thousands of individual timing samples or the full dictionary to git.
if (summary) {
  const compact = { ...receipt, measurements: receipt.measurements.map(({ samples, ...measurement }) => measurement) };
  await atomicWrite(path(summary.replace(/\.md$/, '.json')), encodeJSON(compact));
}
