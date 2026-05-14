import type { DetectionModule, DetectionResult } from './types';

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

export interface BrowserFingerprintData {
  userAgent: string;
  language: string;
  languages: readonly string[];
  platform: string;
  cookieEnabled: boolean;
  doNotTrack: string | null;
  screenResolution: {
    width: number;
    height: number;
    colorDepth: number;
    pixelDepth: number;
  };
  timezone: {
    offset: number;
    name: string;
  };
  plugins: string[];
  hardwareConcurrency: number;
  deviceMemory?: number;
  onlineStatus: boolean;
}

async function detectBrowserFingerprint(): Promise<BrowserFingerprintData> {
  const screen = window.screen;
  const navigator = window.navigator as NavigatorWithDeviceMemory;

  const timezone = {
    offset: new Date().getTimezoneOffset(),
    name: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const plugins: string[] = [];
  for (let i = 0; i < navigator.plugins.length; i++) {
    plugins.push(navigator.plugins[i].name);
  }

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    screenResolution: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
    },
    timezone,
    plugins,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    onlineStatus: navigator.onLine,
  };
}

export const browserFingerprintModule: DetectionModule<BrowserFingerprintData> = {
  id: 'browser-fingerprint',
  name: 'Browser fingerprint',
  description: 'UA, screen, timezone, plugins, CPU, memory and other basic fingerprints',
  category: 'browser',
  icon: 'Fingerprint',
  enabled: true,
  detect: async (): Promise<DetectionResult<BrowserFingerprintData>> => {
    try {
      const data = await detectBrowserFingerprint();
      return {
        success: true,
        data,
        detectedAt: new Date(),
        metadata: {
          pluginCount: data.plugins.length,
          languageCount: data.languages.length,
          hasDeviceMemory: data.deviceMemory !== undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Browser fingerprint detection failed',
        detectedAt: new Date(),
      };
    }
  },
};
