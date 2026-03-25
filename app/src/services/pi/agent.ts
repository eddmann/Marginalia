import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import type { UserMessage, AssistantMessage } from '@mariozechner/pi-ai';
import { createTauriStreamFn } from './tauriFetch';
import type { ChatMessage } from './chatPersistence';
export { webSearchTool } from './tools/webSearch';

export function createReadingAgent(config: {
  provider: string;
  modelId: string;
  getApiKey: (provider: string) => string | undefined;
}) {
  // Dynamic provider/model selection requires bypassing strict generics
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const model = (getModel as Function)(config.provider, config.modelId);
  return new Agent({
    initialState: {
      systemPrompt: '',
      model,
      thinkingLevel: 'off' as const,
      tools: [],
    },
    getApiKey: config.getApiKey,
    streamFn: createTauriStreamFn(),
  });
}

export function buildSystemPrompt(opts: {
  bookTitle: string;
  bookAuthor: string;
  chapterTitle: string;
  chapterText: string;
  webSearchEnabled: boolean;
}): string {
  const parts = [
    `You are a reading companion for "${opts.bookTitle}" by ${opts.bookAuthor}.`,
    `The reader is currently in: ${opts.chapterTitle}`,
    '',
  ];

  if (opts.chapterText) {
    parts.push('<current-chapter>', opts.chapterText, '</current-chapter>', '');
  }

  parts.push(
    'Help the reader understand the material. Be concise and direct.',
    'When the reader shares a passage, explain it clearly and answer follow-up questions.',
    opts.chapterText ? 'You have the full chapter text above for reference.' : '',
  );

  if (opts.webSearchEnabled) {
    parts.push(
      '',
      'You have a web_search tool. Use it when the reader asks about real-world context, historical facts, people, or topics not fully covered in the book text. Do not search for things you can answer from the chapter text alone.',
    );
  }

  return parts.filter(Boolean).join('\n');
}

const ZERO_USAGE = {
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** Convert persisted ChatMessages into AgentMessages so the agent has conversation history. */
export function chatMessagesToAgentMessages(msgs: ChatMessage[], provider: string, modelId: string): AgentMessage[] {
  return msgs.map((m): AgentMessage => {
    if (m.role === 'user') {
      return { role: 'user', content: m.content, timestamp: m.timestamp } satisfies UserMessage;
    }
    return {
      role: 'assistant',
      content: [{ type: 'text', text: m.content }],
      api: 'anthropic-messages',
      provider,
      model: modelId,
      usage: ZERO_USAGE,
      stopReason: 'stop',
      timestamp: m.timestamp,
    } satisfies AssistantMessage;
  });
}

export function buildUserMessageWithContext(
  userMessage: string,
  context: {
    selectedText: string;
    surroundingText: string;
    chapterTitle: string;
  } | null,
): string {
  if (!context) return userMessage;

  const parts: string[] = [];

  parts.push(`> [Selected from "${context.chapterTitle}"]`);
  for (const line of context.selectedText.split('\n')) {
    parts.push(`> ${line}`);
  }

  if (context.surroundingText) {
    parts.push('', '<surrounding-context>', context.surroundingText, '</surrounding-context>');
  }

  if (userMessage.trim()) {
    parts.push('', userMessage);
  }

  return parts.join('\n');
}
