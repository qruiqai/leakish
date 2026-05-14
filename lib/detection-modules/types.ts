export type ModuleCategory = 'network' | 'browser' | 'hardware' | 'privacy' | 'other';

export interface DetectionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  detectedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface DetectionModule<T = unknown> {
  id: string;
  name: string;
  description: string;
  category: ModuleCategory;
  icon: string;
  enabled: boolean;
  detect: () => Promise<DetectionResult<T>>;
}

export interface ModuleConfig {
  id: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
}
