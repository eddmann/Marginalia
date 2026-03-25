/**
 * Proxy all LLM API requests through Tauri's native HTTP client.
 * Browser-based fetch sends Origin headers that trigger CORS rejections
 * from providers like Anthropic and OpenAI. Routing all non-local
 * requests through Tauri's HTTP plugin avoids this entirely.
 */
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { streamSimple } from '@mariozechner/pi-ai';
import type { Model, Context, SimpleStreamOptions } from '@mariozechner/pi-ai';

let installed = false;

/** Headers to strip so providers don't treat this as a browser request. */
const STRIP_HEADERS = new Set([
  'anthropic-dangerous-direct-browser-access',
  'origin',
]);

function isLocalUrl(url: string): boolean {
  return url.startsWith('/') || url.includes('localhost') || url.includes('127.0.0.1');
}

function installTauriFetchProxy(): void {
  if (installed) return;
  installed = true;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url;

    if (!isLocalUrl(url) && init) {
      const cleaned = new Headers();
      const source = new Headers(init.headers);
      source.forEach((v, k) => {
        if (!STRIP_HEADERS.has(k.toLowerCase())) cleaned.set(k, v);
      });
      // Empty origin so the plugin removes it (requires unsafe-headers feature)
      cleaned.set('origin', '');

      return tauriFetch(url, { ...init, headers: cleaned });
    }

    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
}

export function createTauriStreamFn() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (model: Model<any>, context: Context, options?: SimpleStreamOptions) => {
    installTauriFetchProxy();
    return streamSimple(model, context, options);
  };
}
