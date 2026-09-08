import { readFile, mkdir, mkdtemp, rm, rename } from 'node:fs/promises';
import { path, json, sha256, verifyHash, atomicWrite, run, encodeJSON } from './lib/common.mjs';

// Only the archive is cached. Always extract and build from verified bytes, so
// edits to a previously extracted tree cannot silently change the oracle.
const lock = await json(path('tests/reference/lock.json'));
const archive = path('.cache/upstream/cmigemo.tar.gz');
let bytes;
try { bytes = await readFile(archive); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(lock.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`reference download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  verifyHash(bytes, lock.sha256, 'C/Migemo archive');
  await atomicWrite(archive, bytes);
}
verifyHash(bytes, lock.sha256, 'C/Migemo archive');
await mkdir(path('.cache'), { recursive: true });
const temporary = await mkdtemp(path('.cache/reference-build-'));
try {
  run('tar', ['-xzf', archive, '-C', temporary]);
  const source = `${temporary}/cmigemo-${lock.commit}`;
  const build = `${temporary}/build`;
  run('cmake', ['-S', source, '-B', build, '-DBUILD_DICT=OFF', '-DBUILD_TESTING=OFF', '-DENABLE_ZSTD=OFF', '-DCMAKE_INSTALL_LIBDIR=lib']);
  run('cmake', ['--build', build, '--target', 'migemo_static', '--parallel', '2']);
  const driver = path('tests/reference/cmigemo-driver.c');
  run(process.env.CC || 'cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-I', `${build}/src/include`, driver, `${build}/lib/libmigemo_static.a`, '-o', `${temporary}/cmigemo-driver`]);
  const output = path('.cache/reference');
  await mkdir(output, { recursive: true });
  const files = {};
  for (const name of [...lock.tables, 'LICENSE']) {
    const data = await readFile(`${source}/${name === 'LICENSE' ? '' : 'dict/'}${name}`);
    files[name] = sha256(data);
    await atomicWrite(`${output}/${name}`, data);
  }
  const binary = await readFile(`${temporary}/cmigemo-driver`);
  files['cmigemo-driver'] = sha256(binary);
  await rename(`${temporary}/cmigemo-driver`, `${output}/cmigemo-driver`);
  await atomicWrite(`${output}/receipt.json`, encodeJSON({
    lockSha256: sha256(await readFile(path('tests/reference/lock.json'))),
    driverSha256: sha256(await readFile(driver)), files,
  }));
  console.log(`C/Migemo ${lock.version} (${lock.commit}) prepared; source checksum verified.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
