import { ModuleManager } from '../module-manager';
import type { DetectionModule, DetectionResult } from '../types';

function mockModule<T>(
  id: string,
  detect: () => Promise<DetectionResult<T>>,
  overrides: Partial<DetectionModule<T>> = {}
): DetectionModule<T> {
  return {
    id,
    name: id,
    description: '',
    category: 'other',
    icon: 'Network',
    enabled: true,
    detect,
    ...overrides,
  };
}

describe('ModuleManager', () => {
  function freshManager() {
    const mgr = new ModuleManager();
    // Clear all pre-registered modules for isolated tests
    // Reset by iterating, unregister isn't exposed; instead toggle off.
    for (const m of mgr.getAllModules()) mgr.setModuleEnabled(m.id, false);
    return mgr;
  }

  it('registers modules and exposes them', () => {
    const mgr = freshManager();
    mgr.registerModule(
      mockModule('test-1', async () => ({ success: true, detectedAt: new Date(), data: { ok: 1 } }))
    );
    expect(mgr.getModule('test-1')).toBeDefined();
    expect(mgr.isModuleEnabled('test-1')).toBe(true);
  });

  it('toggles enable state', () => {
    const mgr = freshManager();
    mgr.registerModule(
      mockModule('test-toggle', async () => ({ success: true, detectedAt: new Date() }), {
        enabled: false,
      })
    );
    expect(mgr.isModuleEnabled('test-toggle')).toBe(false);
    mgr.toggleModule('test-toggle');
    expect(mgr.isModuleEnabled('test-toggle')).toBe(true);
    mgr.setModuleEnabled('test-toggle', false);
    expect(mgr.isModuleEnabled('test-toggle')).toBe(false);
  });

  it('runs a single module and stores its result', async () => {
    const mgr = freshManager();
    mgr.registerModule(
      mockModule('test-run', async () => ({
        success: true,
        detectedAt: new Date(),
        data: { value: 42 },
      }))
    );
    const result = await mgr.runModule('test-run');
    expect(result.success).toBe(true);
    expect(mgr.getResult<{ value: number }>('test-run')?.data?.value).toBe(42);
  });

  it('throws when module is unknown or disabled', async () => {
    const mgr = freshManager();
    await expect(mgr.runModule('missing')).rejects.toThrow('not found');
    mgr.registerModule(
      mockModule('test-off', async () => ({ success: true, detectedAt: new Date() }), {
        enabled: false,
      })
    );
    await expect(mgr.runModule('test-off')).rejects.toThrow('disabled');
  });

  it('captures thrown errors from detect() as a failed result', async () => {
    const mgr = freshManager();
    mgr.registerModule(
      mockModule('test-throw', async () => {
        throw new Error('boom');
      })
    );
    const result = await mgr.runModule('test-throw');
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
    expect(mgr.getResult('test-throw')?.success).toBe(false);
  });

  it('isolates failures across runAllEnabledModules', async () => {
    const mgr = freshManager();
    mgr.registerModule(
      mockModule('ok', async () => ({ success: true, detectedAt: new Date(), data: 'ok' }))
    );
    mgr.registerModule(
      mockModule('fail', async () => {
        throw new Error('detect crashed');
      })
    );

    const results = await mgr.runAllEnabledModules();
    expect(results.get('ok')?.success).toBe(true);
    expect(results.get('fail')?.success).toBe(false);
    expect(results.get('fail')?.error).toBe('detect crashed');
  });

  it('reports accurate stats', async () => {
    const mgr = freshManager();
    mgr.registerModule(mockModule('ok', async () => ({ success: true, detectedAt: new Date() })));
    mgr.registerModule(
      mockModule('fail', async () => ({
        success: false,
        detectedAt: new Date(),
        error: 'nope',
      }))
    );
    await mgr.runAllEnabledModules();
    const stats = mgr.getModuleStats();
    expect(stats.total).toBeGreaterThanOrEqual(2);
    expect(stats.withResults).toBe(2);
    expect(stats.successful).toBe(1);
    expect(stats.failed).toBe(1);
  });

  it('clears individual and all results', async () => {
    const mgr = freshManager();
    mgr.registerModule(mockModule('a', async () => ({ success: true, detectedAt: new Date() })));
    mgr.registerModule(mockModule('b', async () => ({ success: true, detectedAt: new Date() })));
    await mgr.runAllEnabledModules();
    expect(mgr.getAllResults().size).toBe(2);
    mgr.clearResult('a');
    expect(mgr.getResult('a')).toBeUndefined();
    mgr.clearResults();
    expect(mgr.getAllResults().size).toBe(0);
  });
});
