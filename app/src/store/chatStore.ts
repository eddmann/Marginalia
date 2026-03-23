import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChatContext {
  selectedText: string;
  surroundingText: string;
  chapterTitle: string;
  chapterText: string;
  bookTitle: string;
  bookAuthor: string;
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

  togglePanel: () => void;
  setOpen: (open: boolean) => void;
  setPinned: (pinned: boolean) => void;
  setPanelWidth: (width: number) => void;
  setPendingContext: (ctx: ChatContext | null) => void;
  updateBookContext: (title: string, author: string, chapter: string, chapterText: string) => void;
  setBookHash: (hash: string) => void;
  setConversationId: (id: string) => void;
  setModel: (provider: string, modelId: string) => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      isOpen: false,
      isPinned: false,
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
    }),
    {
      name: 'marginalia-chat',
      partialize: (state) => ({
        isOpen: state.isOpen,
        isPinned: state.isPinned,
        panelWidth: state.panelWidth,
        provider: state.provider,
        modelId: state.modelId,
      }),
    },
  ),
);
