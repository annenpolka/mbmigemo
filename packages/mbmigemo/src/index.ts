export type Backend = 'auto' | 'js' | 'wasm-gc';
export type MigemoOptions = { dictionary: Uint8Array; backend?: Backend };
export interface Migemo {
  readonly backend: 'js' | 'wasm-gc';
  query(input: string): string;
}
export type MigemoErrorCode = 'UnsupportedBackend' | 'InvalidDictionary' | 'InitializationFailed';

export class MigemoError extends Error {
  constructor(readonly code: MigemoErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MigemoError';
  }
}

type Core = {
  is_valid(instance: unknown): boolean | number;
  query(instance: unknown, input: string): string;
};
type WasmCore = Core & { initialize_latin1(bytes: string): unknown };
const compileOptions = { builtins: ['js-string'], importedStringConstants: '_' };

// Older TypeScript DOM declarations omit the standardized compile-options arg.
const instantiate = (bytes: Uint8Array<ArrayBuffer>) =>
  (WebAssembly.instantiate as unknown as (bytes: Uint8Array<ArrayBuffer>, imports: WebAssembly.Imports, options: typeof compileOptions) => Promise<WebAssembly.WebAssemblyInstantiatedSource>)(bytes, {}, compileOptions);

async function supportsWasm(): Promise<boolean> {
  if (typeof WebAssembly === 'undefined') return false;
  // Loading our artifact must succeed independently of runtime feature support.
  const { featureBytes } = await import('./feature-bytes.js');
  try {
    const { instance } = await instantiate(featureBytes);
    const create = instance.exports.create as (text: string) => unknown;
    const read = instance.exports.read as (box: unknown) => string;
    const input = 'けんさく𠮷\0\ud800';
    return read(create(input)) === `${input}!`;
  } catch (cause) {
    if (cause instanceof WebAssembly.CompileError || cause instanceof WebAssembly.LinkError || cause instanceof TypeError) return false;
    throw cause;
  }
}

let wasmCore: Promise<WasmCore> | undefined;
async function loadWasm(): Promise<WasmCore> {
  if (!wasmCore) {
    wasmCore = (async () => {
      const url = new URL('./core.wasm', import.meta.url);
      let bytes: Uint8Array<ArrayBuffer>;
      if (url.protocol === 'file:') {
        const { readFile } = await import('node:fs/promises');
        bytes = new Uint8Array(await readFile(url));
      } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Cannot load Wasm core: HTTP ${response.status}`);
        bytes = new Uint8Array(await response.arrayBuffer());
      }
      return (await instantiate(bytes)).instance.exports as unknown as WasmCore;
    })();
    // A failed download/compile must not permanently poison subsequent attempts.
    wasmCore.catch(() => { wasmCore = undefined; });
  }
  return wasmCore;
}

/** Initialize once from a byte view, then generate patterns synchronously. */
export async function createMigemo(options: MigemoOptions): Promise<Migemo> {
  const requested = options?.backend ?? 'js';
  if (!['js', 'wasm-gc', 'auto'].includes(requested)) {
    throw new MigemoError('UnsupportedBackend', `Unknown backend: ${requested}`);
  }
  if (!(options?.dictionary instanceof Uint8Array)) {
    throw new MigemoError('InvalidDictionary', 'dictionary must be a Uint8Array');
  }
  // Capture the supplied view before the first await, so concurrent caller
  // mutation during loading cannot corrupt initialization either.
  let dictionary: Uint8Array<ArrayBuffer>;
  try {
    dictionary = new Uint8Array(options.dictionary);
  } catch (cause) {
    throw new MigemoError('InvalidDictionary', 'Cannot read dictionary byte view', { cause });
  }
  try {
    const backend = requested === 'js' ? 'js' : await supportsWasm() ? 'wasm-gc' : 'js';
    if (requested === 'wasm-gc' && backend !== 'wasm-gc') {
      throw new MigemoError('UnsupportedBackend', 'Wasm GC and JS String Builtins are required');
    }
    let core: Core;
    let instance: unknown;
    if (backend === 'js') {
      const js = await import('./core.js');
      core = js;
      instance = js.initialize(dictionary);
    } else {
      const wasm = await loadWasm();
      core = wasm;
      // Chunked bulk transfer keeps the host argument stack bounded. The MoonBit
      // side materializes Bytes once; no host calls are made during queries.
      const chunks: string[] = [];
      for (let offset = 0; offset < dictionary.length; offset += 8192) {
        chunks.push(String.fromCharCode(...dictionary.subarray(offset, offset + 8192)));
      }
      instance = wasm.initialize_latin1(chunks.join(''));
    }
    if (!core.is_valid(instance)) throw new MigemoError('InvalidDictionary', 'Malformed compact dictionary');
    return Object.freeze({
      backend,
      query(input: string): string {
        if (typeof input !== 'string') throw new TypeError('query input must be a string');
        return core.query(instance, input);
      },
    });
  } catch (cause) {
    if (cause instanceof MigemoError) throw cause;
    throw new MigemoError('InitializationFailed', 'Could not initialize Migemo', { cause });
  }
}
