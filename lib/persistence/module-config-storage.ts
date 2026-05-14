import { logger } from '@/lib/logger';

// Bumped to v2 when defaults changed (all modules now default-enabled).
// Old v1 entries are intentionally ignored so returning users pick up the new defaults.
const STORAGE_KEY = 'detect:module-enabled:v2';
const STORAGE_VERSION = 2 as const;

export type EnabledMap = Record<string, boolean>;

interface Payload {
  version: typeof STORAGE_VERSION;
  enabled: EnabledMap;
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadEnabledMap(): EnabledMap | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Payload;
    if (
      parsed?.version !== STORAGE_VERSION ||
      typeof parsed.enabled !== 'object' ||
      parsed.enabled == null
    ) {
      return null;
    }
    const out: EnabledMap = {};
    for (const [k, v] of Object.entries(parsed.enabled)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch (error) {
    logger.warn('Failed to load module config from localStorage:', error);
    return null;
  }
}

export function saveEnabledMap(enabled: EnabledMap): void {
  if (!hasStorage()) return;
  try {
    const payload: Payload = { version: STORAGE_VERSION, enabled };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    logger.warn('Failed to persist module config to localStorage:', error);
  }
}

export function clearEnabledMap(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    logger.warn('Failed to clear module config from localStorage:', error);
  }
}

export const __STORAGE_KEY_FOR_TESTS = STORAGE_KEY;
