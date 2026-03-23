/**
 * Persist chat conversations as JSONL files via Tauri fs.
 * Storage: $APPDATA/marginalia/chats/{bookHash}/{conversationId}.jsonl
 */
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  remove,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** For user messages with a book selection — displayed as a compact quote */
  selection?: {
    text: string;
    chapter: string;
  };
}

interface ConversationMeta {
  id: string;
  name: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

const CHATS_DIR = 'chats';

async function ensureDir(path: string): Promise<void> {
  try {
    const dirExists = await exists(path, { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true });
    }
  } catch {
    await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true });
  }
}

function bookDir(bookHash: string): string {
  return `${CHATS_DIR}/${bookHash}`;
}

function conversationFile(bookHash: string, conversationId: string): string {
  return `${bookDir(bookHash)}/${conversationId}.jsonl`;
}

function indexFile(bookHash: string): string {
  return `${bookDir(bookHash)}/conversations.json`;
}

export async function saveMessages(
  bookHash: string,
  conversationId: string,
  messages: ChatMessage[],
): Promise<void> {
  await ensureDir(bookDir(bookHash));
  const jsonl = messages.map((m) => JSON.stringify(m)).join('\n');
  await writeTextFile(conversationFile(bookHash, conversationId), jsonl, {
    baseDir: BaseDirectory.AppData,
  });
}

export async function loadMessages(
  bookHash: string,
  conversationId: string,
): Promise<ChatMessage[]> {
  try {
    const path = conversationFile(bookHash, conversationId);
    const fileExists = await exists(path, { baseDir: BaseDirectory.AppData });
    if (!fileExists) return [];
    const content = await readTextFile(path, { baseDir: BaseDirectory.AppData });
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ChatMessage);
  } catch {
    return [];
  }
}

export async function saveConversationIndex(
  bookHash: string,
  conversations: ConversationMeta[],
): Promise<void> {
  await ensureDir(bookDir(bookHash));
  await writeTextFile(indexFile(bookHash), JSON.stringify(conversations, null, 2), {
    baseDir: BaseDirectory.AppData,
  });
}

export async function loadConversationIndex(
  bookHash: string,
): Promise<ConversationMeta[]> {
  try {
    const path = indexFile(bookHash);
    const fileExists = await exists(path, { baseDir: BaseDirectory.AppData });
    if (!fileExists) return [];
    const content = await readTextFile(path, { baseDir: BaseDirectory.AppData });
    return JSON.parse(content) as ConversationMeta[];
  } catch {
    return [];
  }
}

export async function deleteConversation(
  bookHash: string,
  conversationId: string,
): Promise<void> {
  try {
    const path = conversationFile(bookHash, conversationId);
    await remove(path, { baseDir: BaseDirectory.AppData });
  } catch {
    // File may not exist
  }
}

export type { ChatMessage, ConversationMeta };
