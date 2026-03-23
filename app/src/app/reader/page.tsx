'use client';

import { useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useOpenWithBooks } from '@/hooks/useOpenWithBooks';
import { useSettingsStore } from '@/store/settingsStore';
import { tauriHandleSetAlwaysOnTop } from '@/utils/window';
import Reader from './components/Reader';

// This is only used for the Tauri app in the app router
export default function Page() {
  const { appService } = useEnv();
  const { settings } = useSettingsStore();

  useOpenWithBooks();

  useEffect(() => {
    if (appService?.hasWindow && settings.alwaysOnTop) {
      tauriHandleSetAlwaysOnTop(settings.alwaysOnTop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.alwaysOnTop]);

  return <Reader />;
}
