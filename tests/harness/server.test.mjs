import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer } from '../../scripts/lib/server.mjs';

function rawGet(origin, requestPath) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    // URL-based clients normalize paths before sending. Use the raw HTTP path
    // so the server actually receives the malformed network-path reference.
    const req = request({ hostname: url.hostname, port: url.port, path: requestPath, method: 'GET' }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.once('error', reject);
    req.end();
  });
}

test('malformed request URLs return 400 and do not terminate the demo server', async () => {
  const server = await startServer({ port: 0, dictionary: 'tiny' });
  try {
    const invalid = await rawGet(server.url, '//[');
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body, 'Invalid request URL');
    const healthy = await rawGet(server.url, '/health');
    assert.equal(healthy.status, 200);
    assert.deepEqual(JSON.parse(healthy.body), { app: 'mbmigemo', status: 'ok' });
  } finally { await server.close(); }
});
