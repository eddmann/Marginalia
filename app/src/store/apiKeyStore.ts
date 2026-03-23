import { create } from 'zustand';

interface ApiKeyState {
  keys: Record<string, string>;
  getKey: (provider: string) => string | undefined;
  setKey: (provider: string, key: string) => void;
  removeKey: (provider: string) => void;
  getConfiguredProviders: () => string[];
  loadExternalTokens: () => Promise<void>;
}

export const useApiKeyStore = create<ApiKeyState>()((set, get) => ({
  keys: {},
  getKey: (provider: string) => get().keys[provider],
  setKey: (provider: string, key: string) =>
    set((state) => ({ keys: { ...state.keys, [provider]: key } })),
  removeKey: (provider: string) =>
    set((state) => {
      const { [provider]: _, ...rest } = state.keys;
      return { keys: rest };
    }),
  getConfiguredProviders: () =>
    Object.entries(get().keys)
      .filter(([_, v]) => v.length > 0)
      .map(([k]) => k),
  loadExternalTokens: async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    // Try to load OAuth token from Claude Code keychain on macOS
    try {
      const stdout = await invoke<string>('read_keychain_item', {
        service: 'Claude Code-credentials',
      });
      if (stdout) {
        const data = JSON.parse(stdout);
        const oauth = data.claudeAiOauth;
        if (oauth?.accessToken?.includes('sk-ant-oat')) {
          set((state) => ({
            keys: { ...state.keys, anthropic: oauth.accessToken },
          }));
        }
      }
    } catch {
      // Not on macOS or no Claude Code credentials — ignore
    }

    // Try to load OpenAI Codex token from ~/.codex/auth.json
    try {
      const { homeDir } = await import('@tauri-apps/api/path');
      const home = await homeDir();
      const codexPath = `${home.endsWith('/') ? home : home + '/'}.codex/auth.json`;
      const content = await invoke<string>('read_file_contents', {
        path: codexPath,
      });
      if (content) {
        const data = JSON.parse(content);
        if (data.tokens?.access_token) {
          set((state) => ({
            keys: { ...state.keys, 'openai-codex': data.tokens.access_token },
          }));
        }
      }
    } catch {
      // No Codex auth — ignore
    }
  },
}));
