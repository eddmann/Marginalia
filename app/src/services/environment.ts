import { AppService } from '@/types/system';
import { MARGINALIA_NODE_BASE_URL, MARGINALIA_WEB_BASE_URL } from './constants';

declare global {
  interface Window {
    __MARGINALIA_CLI_ACCESS?: boolean;
  }
}

export const isTauriAppPlatform = () => true;
export const isWebAppPlatform = () => false;
export const hasCli = () => window.__MARGINALIA_CLI_ACCESS === true;
export const isPWA = () => window.matchMedia('(display-mode: standalone)').matches;
const getBaseUrl = () => MARGINALIA_WEB_BASE_URL;
const getNodeBaseUrl = () => MARGINALIA_NODE_BASE_URL;

const isMacPlatform = () =>
  typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const getCommandPaletteShortcut = () => (isMacPlatform() ? '⌘⇧P' : 'Ctrl+Shift+P');

export const getAPIBaseUrl = () => `${getBaseUrl()}/api`;


export interface EnvConfigType {
  getAppService: () => Promise<AppService>;
}

let nativeAppService: AppService | null = null;
const getNativeAppService = async () => {
  if (!nativeAppService) {
    const { NativeAppService } = await import('@/services/nativeAppService');
    nativeAppService = new NativeAppService();
    await nativeAppService.init();
  }
  return nativeAppService;
};

let webAppService: AppService | null = null;
const getWebAppService = async () => {
  if (!webAppService) {
    const { WebAppService } = await import('@/services/webAppService');
    webAppService = new WebAppService();
    await webAppService.init();
  }
  return webAppService;
};

const environmentConfig: EnvConfigType = {
  getAppService: async () => {
    if (isTauriAppPlatform()) {
      return getNativeAppService();
    } else {
      return getWebAppService();
    }
  },
};

export default environmentConfig;
