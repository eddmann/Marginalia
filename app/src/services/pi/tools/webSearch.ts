/**
 * Web search tool using Exa AI neural search via JSON-RPC/SSE.
 * Uses the free MCP endpoint — no API key required.
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp';
const MAX_RESULTS = 10;
const DEFAULT_RESULTS = 5;
const CONTEXT_MAX_CHARS = 10_000;

interface ExaResponse {
  jsonrpc: '2.0';
  id: number;
  result?: { content?: { type: string; text: string }[] };
  error?: { code: number; message: string };
}

function parseSSEResponse(text: string): string {
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      return line.substring(6);
    }
  }
  throw new Error('No data field found in SSE response');
}

const parameters = Type.Object({
  query: Type.String({ description: 'The search query' }),
  count: Type.Optional(
    Type.Number({ description: `Number of results to return (default ${DEFAULT_RESULTS}, max ${MAX_RESULTS})` }),
  ),
});

export const webSearchTool: AgentTool<typeof parameters> = {
  name: 'web_search',
  label: 'Web Search',
  description:
    'Search the web for up-to-date information about topics, people, concepts, historical context, or anything beyond the book text.',
  parameters,
  async execute(_toolCallId, params, signal) {
    const query = params.query;
    const count = Math.min(Math.max(params.count ?? DEFAULT_RESULTS, 1), MAX_RESULTS);

    try {
      const response = await fetch(EXA_MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'web_search_exa',
            arguments: {
              query,
              numResults: count,
              type: 'auto',
              contextMaxCharacters: CONTEXT_MAX_CHARS,
            },
          },
        }),
        signal: signal ?? AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        return {
          content: [{ type: 'text' as const, text: `Search failed: HTTP ${response.status} ${response.statusText}` }],
          details: null,
        };
      }

      const text = await response.text();
      const jsonData = parseSSEResponse(text);
      const parsed: ExaResponse = JSON.parse(jsonData);

      if (parsed.error) {
        return {
          content: [{ type: 'text' as const, text: `Search failed: ${parsed.error.message}` }],
          details: null,
        };
      }

      if (!parsed.result?.content?.length) {
        return {
          content: [{ type: 'text' as const, text: `No results found for "${query}"` }],
          details: null,
        };
      }

      const resultText = parsed.result.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n\n');

      return {
        content: [{ type: 'text' as const, text: resultText }],
        details: parsed.result.content,
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Search error: ${err instanceof Error ? err.message : String(err)}` }],
        details: null,
      };
    }
  },
};
