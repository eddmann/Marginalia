import { FileSystem } from '@/types/system';
import { SystemSettings } from '@/types/settings';
import { ViewSettings } from '@/types/book';
import {
  DEFAULT_BOOK_LAYOUT,
  DEFAULT_BOOK_STYLE,
  DEFAULT_BOOK_FONT,
  DEFAULT_BOOK_LANGUAGE,
  DEFAULT_VIEW_CONFIG,
  DEFAULT_READSETTINGS,
  SYSTEM_SETTINGS_VERSION,
  DEFAULT_MOBILE_VIEW_SETTINGS,
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_CJK_VIEW_SETTINGS,
  DEFAULT_MOBILE_READSETTINGS,
  DEFAULT_SCREEN_CONFIG,
  SETTINGS_FILENAME,
  DEFAULT_MOBILE_SYSTEM_SETTINGS,
  DEFAULT_ANNOTATOR_CONFIG,
} from './constants';
import { isCJKEnv } from '@/utils/misc';
import { safeLoadJSON, safeSaveJSON } from './persistence';

export interface Context {
  fs: FileSystem;
  isMobile: boolean;
  isAppDataSandbox: boolean;
}

export function getDefaultViewSettings(ctx: Context): ViewSettings {
  return {
    ...DEFAULT_BOOK_LAYOUT,
    ...DEFAULT_BOOK_STYLE,
    ...DEFAULT_BOOK_FONT,
    ...DEFAULT_BOOK_LANGUAGE,
    ...(ctx.isMobile ? DEFAULT_MOBILE_VIEW_SETTINGS : {}),
    ...(isCJKEnv() ? DEFAULT_CJK_VIEW_SETTINGS : {}),
    ...DEFAULT_VIEW_CONFIG,
    ...DEFAULT_SCREEN_CONFIG,
    ...DEFAULT_ANNOTATOR_CONFIG,
  };
}

export async function loadSettings(ctx: Context): Promise<SystemSettings> {
  const defaultSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...(ctx.isMobile ? DEFAULT_MOBILE_SYSTEM_SETTINGS : {}),
    version: SYSTEM_SETTINGS_VERSION,
    localBooksDir: await ctx.fs.getPrefix('Books'),
    globalReadSettings: {
      ...DEFAULT_READSETTINGS,
      ...(ctx.isMobile ? DEFAULT_MOBILE_READSETTINGS : {}),
    },
    globalViewSettings: getDefaultViewSettings(ctx),
  } as SystemSettings;

  let settings = await safeLoadJSON<SystemSettings>(
    ctx.fs,
    SETTINGS_FILENAME,
    'Settings',
    defaultSettings,
  );

  const version = settings.version ?? 0;
  if (ctx.isAppDataSandbox || version < SYSTEM_SETTINGS_VERSION) {
    settings.version = SYSTEM_SETTINGS_VERSION;
  }
  settings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...(ctx.isMobile ? DEFAULT_MOBILE_SYSTEM_SETTINGS : {}),
    ...settings,
  };
  settings.globalReadSettings = {
    ...DEFAULT_READSETTINGS,
    ...(ctx.isMobile ? DEFAULT_MOBILE_READSETTINGS : {}),
    ...settings.globalReadSettings,
  };
  settings.globalViewSettings = {
    ...getDefaultViewSettings(ctx),
    ...settings.globalViewSettings,
  };
  settings.localBooksDir = await ctx.fs.getPrefix('Books');

  return settings;
}

export async function saveSettings(fs: FileSystem, settings: SystemSettings): Promise<void> {
  await safeSaveJSON(fs, SETTINGS_FILENAME, 'Settings', settings);
}
