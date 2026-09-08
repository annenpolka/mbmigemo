import { readFile } from 'node:fs/promises';
import { path, options, atomicWrite, verifyHash, json } from './lib/common.mjs';
import { compileDictionary } from './lib/dictionary.mjs';

const args = options(process.argv.slice(2), ['--fixture']);
const fixture = args['--fixture'] ?? 'tiny';
if (fixture !== 'tiny') throw new Error('Only --fixture tiny is pinned. Practical dictionary preparation belongs to M3.');
const manifest = await json(path('tests/fixtures/manifest.json'));
for (const [name, entry] of Object.entries(manifest.dictionaries)) {
  const source = await readFile(path(entry.source));
  verifyHash(source, entry.sourceSha256, `${name} source`);
  const bytes = compileDictionary(source.toString('utf8'));
  verifyHash(bytes, entry.sha256, `${name} generated dictionary`);
  await atomicWrite(path(entry.file), bytes);
  console.log(`${name}: ${bytes.length} bytes, SHA-256 verified`);
}
