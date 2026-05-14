import { logger } from '@/lib/logger';
import { audioFingerprintModule } from './audio-fingerprint-module';
import { browserFingerprintModule } from './browser-fingerprint-module';
import { canvasFingerprintModule } from './canvas-fingerprint-module';
import { cdpDetectionModule } from './cdp-detection-module';
import { dnsModule } from './dns-module';
import { fontDetectionModule } from './font-detection-module';
import { networkProbeModule } from './network-probe-module';
import type { DetectionModule, DetectionResult, ModuleCategory, ModuleConfig } from './types';
import { webrtcModule } from './webrtc-module';

type AnyModule = DetectionModule<unknown>;

export interface ModuleStats {
  total: number;
  enabled: number;
  disabled: number;
  withResults: number;
  successful: number;
  failed: number;
}

export class ModuleManager {
  private modules: Map<string, AnyModule> = new Map();
  private results: Map<string, DetectionResult> = new Map();
  private configs: Map<string, ModuleConfig> = new Map();

  constructor() {
    // Order matters: it's the order modules show up in the sidebar.
    this.registerModule(networkProbeModule);
    this.registerModule(webrtcModule);
    this.registerModule(browserFingerprintModule);
    this.registerModule(canvasFingerprintModule);
    this.registerModule(audioFingerprintModule);
    this.registerModule(fontDetectionModule);
    this.registerModule(dnsModule);
    this.registerModule(cdpDetectionModule);
  }

  registerModule<T>(module: DetectionModule<T>) {
    this.modules.set(module.id, module as AnyModule);
    this.configs.set(module.id, { id: module.id, enabled: module.enabled });
  }

  getAllModules(): AnyModule[] {
    return Array.from(this.modules.values());
  }

  getModulesByCategory(category: ModuleCategory): AnyModule[] {
    return this.getAllModules().filter(module => module.category === category);
  }

  getEnabledModules(): AnyModule[] {
    return this.getAllModules().filter(module => this.isModuleEnabled(module.id));
  }

  getModule(id: string): AnyModule | undefined {
    return this.modules.get(id);
  }

  isModuleEnabled(id: string): boolean {
    return this.configs.get(id)?.enabled ?? false;
  }

  setModuleEnabled(id: string, enabled: boolean) {
    const config = this.configs.get(id);
    if (config) {
      config.enabled = enabled;
    }
  }

  toggleModule(id: string) {
    this.setModuleEnabled(id, !this.isModuleEnabled(id));
  }

  async runModule(id: string): Promise<DetectionResult> {
    const module = this.modules.get(id);
    if (!module) {
      throw new Error(`Module ${id} not found`);
    }
    if (!this.isModuleEnabled(id)) {
      throw new Error(`Module ${id} is disabled`);
    }

    try {
      const result = await module.detect();
      this.results.set(id, result);
      return result;
    } catch (error) {
      logger.warn(`Module ${id} threw during detect():`, error);
      const errorResult: DetectionResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        detectedAt: new Date(),
      };
      this.results.set(id, errorResult);
      return errorResult;
    }
  }

  async runAllEnabledModules(): Promise<Map<string, DetectionResult>> {
    const enabledModules = this.getEnabledModules();
    await Promise.all(
      enabledModules.map(module =>
        this.runModule(module.id).catch(error => {
          logger.warn(`runAll: module ${module.id} rejected:`, error);
          const errorResult: DetectionResult = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            detectedAt: new Date(),
          };
          this.results.set(module.id, errorResult);
          return errorResult;
        })
      )
    );
    return new Map(this.results);
  }

  getResult<T = unknown>(id: string): DetectionResult<T> | undefined {
    return this.results.get(id) as DetectionResult<T> | undefined;
  }

  getAllResults(): Map<string, DetectionResult> {
    return new Map(this.results);
  }

  clearResults() {
    this.results.clear();
  }

  clearResult(id: string) {
    this.results.delete(id);
  }

  getModuleConfig(id: string): ModuleConfig | undefined {
    return this.configs.get(id);
  }

  setModuleConfig(id: string, config: Partial<ModuleConfig>) {
    const existingConfig = this.configs.get(id);
    if (existingConfig) {
      this.configs.set(id, { ...existingConfig, ...config });
    }
  }

  exportConfig(): ModuleConfig[] {
    return Array.from(this.configs.values());
  }

  importConfig(configs: ModuleConfig[]) {
    configs.forEach(config => {
      if (this.modules.has(config.id)) {
        this.configs.set(config.id, config);
      }
    });
  }

  getCategories(): ModuleCategory[] {
    const categories = new Set<ModuleCategory>();
    this.getAllModules().forEach(module => categories.add(module.category));
    return Array.from(categories);
  }

  getModuleStats(): ModuleStats {
    const all = this.getAllModules();
    const enabled = this.getEnabledModules();
    const withResults = this.results.size;
    const successful = Array.from(this.results.values()).filter(r => r.success).length;

    return {
      total: all.length,
      enabled: enabled.length,
      disabled: all.length - enabled.length,
      withResults,
      successful,
      failed: withResults - successful,
    };
  }
}

export const moduleManager = new ModuleManager();
