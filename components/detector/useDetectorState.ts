'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@/lib/logger';
import { moduleManager } from '@/lib/detection-modules';
import type { DetectionModule, DetectionResult } from '@/lib/detection-modules';
import type { ModuleStats } from '@/lib/detection-modules';
import { loadEnabledMap, saveEnabledMap } from '@/lib/persistence/module-config-storage';
import { useMessages } from '@/lib/i18n/locale-client';
import { assessAll, type OverallAssessment } from '@/lib/risk';

export interface DetectorState {
  modules: DetectionModule[];
  results: Map<string, DetectionResult>;
  runningIds: Set<string>;
  isRunningAll: boolean;
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  selectedModuleId: string | null;
  setSelectedModuleId: (id: string | null) => void;
  categories: string[];
  filteredModules: DetectionModule[];
  stats: ModuleStats;
  enabledCount: number;
  isModuleEnabled: (id: string) => boolean;
  toggleModule: (id: string) => void;
  runModule: (id: string) => Promise<void>;
  runAllEnabled: () => Promise<void>;
  clearResults: () => void;
  selectedModule: DetectionModule | null;
  selectedResult: DetectionResult | null;
  assessment: OverallAssessment;
}

export function useDetectorState(): DetectorState {
  const [modules, setModules] = useState<DetectionModule[]>(() => moduleManager.getAllModules());
  const [results, setResults] = useState<Map<string, DetectionResult>>(new Map());
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  // Hydrate enabled state from localStorage once on mount
  useEffect(() => {
    const saved = loadEnabledMap();
    if (saved) {
      for (const m of moduleManager.getAllModules()) {
        if (m.id in saved) moduleManager.setModuleEnabled(m.id, saved[m.id]);
      }
      setModules(moduleManager.getAllModules());
    }
  }, []);

  const categories = useMemo(
    () => ['all', ...moduleManager.getCategories()],
    // moduleManager categories are static after registration
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const filteredModules = useMemo(
    () =>
      selectedCategory === 'all' ? modules : modules.filter(m => m.category === selectedCategory),
    [modules, selectedCategory]
  );

  const isModuleEnabled = useCallback((id: string) => moduleManager.isModuleEnabled(id), []);

  const toggleModule = useCallback((id: string) => {
    moduleManager.toggleModule(id);
    const next = moduleManager.getAllModules();
    setModules(next);
    const snapshot: Record<string, boolean> = {};
    for (const m of next) snapshot[m.id] = moduleManager.isModuleEnabled(m.id);
    saveEnabledMap(snapshot);
  }, []);

  const runModule = useCallback(async (id: string) => {
    setRunningIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      await moduleManager.runModule(id);
      setResults(new Map(moduleManager.getAllResults()));
      setSelectedModuleId(id);
    } catch (error) {
      logger.warn(`Error running module ${id}:`, error);
    } finally {
      setRunningIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const runAllEnabled = useCallback(async () => {
    setIsRunningAll(true);
    const enabled = moduleManager.getEnabledModules();
    setRunningIds(new Set(enabled.map(m => m.id)));
    // Land on the overview, not a single module — the user just asked for a verdict.
    setSelectedModuleId(null);
    try {
      await moduleManager.runAllEnabledModules();
      setResults(new Map(moduleManager.getAllResults()));
    } catch (error) {
      logger.warn('Error running modules:', error);
    } finally {
      setIsRunningAll(false);
      setRunningIds(new Set());
    }
  }, []);

  const clearResults = useCallback(() => {
    moduleManager.clearResults();
    setResults(new Map());
    setSelectedModuleId(null);
  }, []);

  const stats = useMemo(
    () => moduleManager.getModuleStats(),
    // Recompute when results or modules change so the UI reflects live stats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, modules]
  );
  const enabledCount = useMemo(
    () => modules.filter(m => moduleManager.isModuleEnabled(m.id)).length,
    [modules]
  );

  const selectedModule = selectedModuleId
    ? (modules.find(m => m.id === selectedModuleId) ?? null)
    : null;
  const selectedResult = selectedModuleId ? (results.get(selectedModuleId) ?? null) : null;

  const messages = useMessages();
  const assessment = useMemo(
    () => assessAll(modules, results, messages),
    [modules, results, messages]
  );

  return {
    modules,
    results,
    runningIds,
    isRunningAll,
    selectedCategory,
    setSelectedCategory,
    selectedModuleId,
    setSelectedModuleId,
    categories,
    filteredModules,
    stats,
    enabledCount,
    isModuleEnabled,
    toggleModule,
    runModule,
    runAllEnabled,
    clearResults,
    selectedModule,
    selectedResult,
    assessment,
  };
}
