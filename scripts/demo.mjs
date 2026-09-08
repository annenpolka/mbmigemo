import { startServer } from './lib/server.mjs';

let port = 4173;
let dictionary = 'practical';
for (let index = 2; index < process.argv.length; index += 2) {
  const [option, value] = process.argv.slice(index, index + 2);
  if (option === '--port' && /^\d+$/.test(value)) port = Number(value);
  else if (option === '--dictionary') dictionary = value;
  else throw new Error(`Unknown or incomplete option: ${option}`);
}
if (port < 0 || port > 65535) throw new Error('port must be between 0 and 65535');
const server = await startServer({ port, dictionary });
console.log(`Migemo demo: ${server.url} (dictionary: ${dictionary})`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
