import { createServer as httpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { path } from './common.mjs';

const routes = new Map([
  ['/', ['examples/browser/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['examples/browser/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['examples/browser/style.css', 'text/css; charset=utf-8']],
  ['/dictionaries/practical.compact', ['.cache/dictionaries/practical/practical.compact', 'application/octet-stream']],
  ['/dictionaries/tiny.compact', ['tests/fixtures/tiny.compact', 'application/octet-stream']],
  ['/dictionaries/alternate.compact', ['tests/fixtures/alternate.compact', 'application/octet-stream']],
]);
for (const name of ['index.js', 'core.js', 'feature-bytes.js', 'core.wasm']) {
  routes.set(`/packages/mbmigemo/dist/${name}`, [`packages/mbmigemo/dist/${name}`, name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8']);
}
for (const name of ['harness.html', 'harness.mjs']) {
  routes.set(`/bench/${name}`, [`bench/${name}`, name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8']);
}

/** Serve only the demo, benchmark harness and explicit public build artifacts. */
export function createServer({ dictionary = 'practical' } = {}) {
  if (!['practical', 'tiny', 'alternate'].includes(dictionary)) throw new Error(`Unknown dictionary: ${dictionary}`);
  return httpServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    let pathname;
    try { pathname = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Invalid request URL');
      return;
    }
    if (pathname === '/health' || pathname === '/demo-config.json') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(pathname === '/health' ? { app: 'mbmigemo', status: 'ok' } : { dictionary }));
      return;
    }
    const route = routes.get(pathname);
    if (!route) { response.writeHead(404).end('Not found'); return; }
    try {
      const bytes = await readFile(path(route[0]));
      response.writeHead(200, { 'Content-Type': route[1], 'Content-Length': bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(route[0].includes('practical.compact')
        ? 'Practical dictionary is unavailable. Run npm run dictionary:prepare -- --fixture practical.'
        : 'Artifact unavailable. Run npm run build.');
    }
  });
}

export async function startServer({ port = 0, dictionary = 'practical' } = {}) {
  const server = createServer({ dictionary });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
