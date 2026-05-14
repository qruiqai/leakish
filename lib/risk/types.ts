/**
 * Risk model.
 *
 * Each detection module produces zero or more `RiskSignal`s. Signals are
 * aggregated into a `ModuleAssessment` per module, and all modules together
 * roll up into an `OverallAssessment` (numeric score + level + counts).
 *
 * Score model (kept deliberately simple):
 *   start at 100; subtract 25 per `critical`, 6 per `warning`; floor at 0.
 *   `safe` signals are informational and do not affect the score.
 *
 * Level mapping:
 *   >= 85         -> 'safe'
 *   60..84        -> 'warning'
 *   < 60          -> 'critical'
 *   no results    -> 'unknown'
 */

export type RiskLevel = 'safe' | 'warning' | 'critical' | 'unknown';

export interface RiskSignal {
  /** Stable id, e.g. `webrtc.public-ip-leak`. Used as React keys + analytics. */
  id: string;
  level: Exclude<RiskLevel, 'unknown'>;
  /** Short headline (Chinese). */
  title: string;
  /** One-sentence explanation of why this matters / what to do. */
  description: string;
  /** The module that produced this signal — drill-in target. */
  moduleId: string;
  /** Optional: tightly-scoped value, e.g. an IP or hash to display inline. */
  value?: string;
}

export interface ModuleAssessment {
  moduleId: string;
  /** Worst signal level for this module, or 'unknown' if module has no result. */
  level: RiskLevel;
  signals: RiskSignal[];
  /** Short one-line module summary, locale-aware (e.g. "1 public IP leak detected"). */
  summary: string;
}

export interface OverallAssessment {
  /** 0–100 (higher = safer). */
  score: number;
  level: RiskLevel;
  /** Counts across *all* signals from all assessed modules. */
  counts: {
    critical: number;
    warning: number;
    safe: number;
  };
  /** Modules that have not produced a result yet (enabled or otherwise). */
  untestedModuleIds: string[];
  /** Per-module breakdown, in module registration order. */
  perModule: ModuleAssessment[];
}
