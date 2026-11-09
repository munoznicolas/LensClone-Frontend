export interface DetectionBaselineMetrics {
  precision: number;
  recall: number;
  f1Score: number;
  averageIoU: number;
}

export interface RecognitionBaselineMetrics {
  exactMatchRatio: number;
  characterErrorRate: number;
  wordErrorRate: number;
}

export interface PerformanceBaselineMetrics {
  averagePipelineLatencyMs: number;
  fps: number;
  stageTimingsMs?: Record<string, number>;
}

export interface MemoryBaselineMetrics {
  peakHeapMb?: number;
  bufferPoolHitRate?: number;
}

export interface GoldenBaseline {
  version: string;
  createdAt: string;
  description: string;
  environment?: string;
  metrics: {
    detection: DetectionBaselineMetrics;
    recognition: RecognitionBaselineMetrics;
    performance: PerformanceBaselineMetrics;
    memory?: MemoryBaselineMetrics;
  };
}

export interface ValidationThresholds {
  maxF1Drop: number; // e.g. 0.01
  maxIoUDrop: number; // e.g. 0.02
  maxCERIncrease: number; // e.g. 0.02
  maxWERIncrease: number; // e.g. 0.03
  maxExactMatchDrop: number; // e.g. 0.02
  maxLatencyIncreasePct: number; // e.g. 5.0 (%)
  minBufferPoolHitRate?: number; // e.g. 0.85
}

export const DEFAULT_VALIDATION_THRESHOLDS: ValidationThresholds = {
  maxF1Drop: 0.01,
  maxIoUDrop: 0.02,
  maxCERIncrease: 0.02,
  maxWERIncrease: 0.03,
  maxExactMatchDrop: 0.02,
  maxLatencyIncreasePct: 5.0,
  minBufferPoolHitRate: 0.85,
};

export type MetricStatus = 'PASS' | 'WARNING' | 'FAIL' | 'IMPROVED';

export interface MetricComparison {
  category: 'detection' | 'recognition' | 'performance' | 'memory';
  metric: string;
  baselineValue: number;
  currentValue: number;
  delta: number;
  deltaPct?: number;
  status: MetricStatus;
  description: string;
}

export interface ValidationReport {
  timestamp: string;
  overallPassed: boolean;
  hasWarnings: boolean;
  score: number;
  comparisons: MetricComparison[];
  regressionsCount: number;
  improvementsCount: number;
  summaryMarkdown: string;
}
