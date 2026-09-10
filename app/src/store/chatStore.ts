import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChatContext {
  selectedText: string;
  surroundingText: string;
  chapterTitle: string;
  chapterText: string;
  bookTitle: string;
  bookAuthor: string;
  /** Location of the selection, so a note can later be anchored back to it. */
  cfi?: string;
  page?: number;
}

interface ChatState {
  isOpen: boolean;
  isPinned: boolean;
  panelWidth: number;
  pendingContext: ChatContext | null;

  bookTitle: string;
  bookAuthor: string;
  bookHash: string;
  currentChapter: string;
  currentChapterText: string;

  conversationId: string;

  provider: string;
  modelId: string;
  webSearchEnabled: boolean;

  togglePanel: () => void;
  setOpen: (open: boolean) => void;
  setPinned: (pinned: boolean) => void;
  setPanelWidth: (width: number) => void;
  setPendingContext: (ctx: ChatContext | null) => void;
  updateBookContext: (title: string, author: string, chapter: string, chapterText: string) => void;
  setBookHash: (hash: string) => void;
  setConversationId: (id: string) => void;
  setModel: (provider: string, modelId: string) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      isOpen: false,
      // Default to docked (push/reflow) so the chat sits beside the book as a
      // right column instead of floating over it.
      isPinned: true,
      panelWidth: 380,
      pendingContext: null,

      bookTitle: '',
      bookAuthor: '',
      bookHash: '',
      currentChapter: '',
      currentChapterText: '',

      conversationId: generateId(),

      provider: 'anthropic',
      modelId: 'claude-opus-4-6',
      webSearchEnabled: false,

      togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
      setOpen: (open) => set({ isOpen: open }),
      setPinned: (pinned) => set({ isPinned: pinned }),
      setPanelWidth: (width) => set({ panelWidth: width }),
      setPendingContext: (ctx) => set({ pendingContext: ctx }),
      updateBookContext: (title, author, chapter, chapterText) =>
        set({ bookTitle: title, bookAuthor: author, currentChapter: chapter, currentChapterText: chapterText }),
      setBookHash: (hash) => set({ bookHash: hash }),
      setConversationId: (id) => set({ conversationId: id }),
      setModel: (provider, modelId) => set({ provider, modelId }),
      setWebSearchEnabled: (enabled) => set({ webSearchEnabled: enabled }),
    }),
    {
      name: 'marginalia-chat',
      version: 1,
      // v1: dock the chat by default. One-time reset of the old floating
      // default for users who never explicitly chose; later toggles persist.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<ChatState>;
        if (version < 1) state.isPinned = true;
        return state as unknown as ChatState;
      },
      partialize: (state) => ({
        isOpen: state.isOpen,
        isPinned: state.isPinned,
        panelWidth: state.panelWidth,
        provider: state.provider,
        modelId: state.modelId,
        webSearchEnabled: state.webSearchEnabled,
      }),
    },
  ),
);
