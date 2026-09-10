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

const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

/**
 * Claude Code OAuth tokens are only accepted by the Anthropic API when the
 * request's `system` field is an ARRAY whose FIRST block is exactly the Claude
 * Code identity string (a concatenated single string is rejected with a
 * disguised 429). The app's real reading-companion instructions ride along in
 * the following block. Rewrites the outgoing request body to satisfy this.
 */
function withClaudeCodeSystem(body: string): string {
  try {
    const json = JSON.parse(body) as { system?: unknown };
    const identity = { type: 'text', text: CLAUDE_CODE_IDENTITY };
    const sys = json.system;
    const first = Array.isArray(sys) && sys.length > 0 ? sys[0] : undefined;
    const firstText = typeof first === 'string' ? first : (first as { text?: string })?.text;
    if (firstText === CLAUDE_CODE_IDENTITY) return body; // already prefixed
    if (typeof sys === 'string') {
      json.system = sys ? [identity, { type: 'text', text: sys }] : [identity];
    } else if (Array.isArray(sys)) {
      json.system = [identity, ...sys];
    } else {
      json.system = [identity];
    }
    return JSON.stringify(json);
  } catch {
    return body;
  }
}

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

      let body = init.body;
      if (url.includes('api.anthropic.com') && typeof init.body === 'string') {
        body = withClaudeCodeSystem(init.body);
      }

      return tauriFetch(url, { ...init, headers: cleaned, body });
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
