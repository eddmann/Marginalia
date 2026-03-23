import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { AppService } from '@/types/system';

const WINDOW_CONTROL_PAD_X = 10.0;
const WINDOW_CONTROL_PAD_Y = 22.0;

interface TrafficLightState {
  appService?: AppService;
  isTrafficLightVisible: boolean;
  shouldShowTrafficLight: boolean;
  trafficLightInFullscreen: boolean;
  initializeTrafficLightStore: (appService: AppService) => void;
  setTrafficLightVisibility: (visible: boolean, position?: { x: number; y: number }) => void;
  initializeTrafficLightListeners: () => Promise<void>;
  cleanupTrafficLightListeners: () => void;
  unlistenEnterFullScreen?: () => void;
  unlistenExitFullScreen?: () => void;
}

export const useTrafficLightStore = create<TrafficLightState>((set, get) => {
  return {
    appService: undefined,
    isTrafficLightVisible: false,
    shouldShowTrafficLight: false,
    trafficLightInFullscreen: false,

    initializeTrafficLightStore: (appService: AppService) => {
      set({
        appService,
        isTrafficLightVisible: appService.hasTrafficLight,
        shouldShowTrafficLight: appService.hasTrafficLight,
      });
    },

    setTrafficLightVisibility: async (visible: boolean, position?: { x: number; y: number }) => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const currentWindow = getCurrentWindow();
      const isFullscreen = await currentWindow.isFullscreen();
      set({
        isTrafficLightVisible: !isFullscreen && visible,
        shouldShowTrafficLight: visible,
        trafficLightInFullscreen: isFullscreen,
      });
      invoke('set_traffic_lights', {
        visible: visible,
        x: position?.x ?? WINDOW_CONTROL_PAD_X,
        y: position?.y ?? WINDOW_CONTROL_PAD_Y,
      }).catch(() => {});
    },

    initializeTrafficLightListeners: async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const currentWindow = getCurrentWindow();

        const unlistenEnterFullScreen = await currentWindow.listen(
          'will-enter-fullscreen',
          async () => {
            const fullscreen = await currentWindow.isFullscreen();
            if (fullscreen) {
              set({ isTrafficLightVisible: false, trafficLightInFullscreen: true });
            }
          },
        );

        const unlistenExitFullScreen = await currentWindow.listen('will-exit-fullscreen', () => {
          const { shouldShowTrafficLight } = get();
          set({ isTrafficLightVisible: shouldShowTrafficLight, trafficLightInFullscreen: false });
        });

        set({ unlistenEnterFullScreen, unlistenExitFullScreen });
      } catch { /* ignore listener setup errors */ }
    },

    cleanupTrafficLightListeners: () => {
      const { unlistenEnterFullScreen, unlistenExitFullScreen } = get();
      try { if (unlistenEnterFullScreen) unlistenEnterFullScreen(); } catch { /* ignore */ }
      try { if (unlistenExitFullScreen) unlistenExitFullScreen(); } catch { /* ignore */ }
      set({ unlistenEnterFullScreen: undefined, unlistenExitFullScreen: undefined });
    },
  };
});
