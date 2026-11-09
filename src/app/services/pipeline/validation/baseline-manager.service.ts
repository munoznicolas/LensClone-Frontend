import { Injectable } from '@angular/core';
import { GoldenBaseline } from './validation.types';
import { BenchmarkSummaryReport } from '../benchmark/dataset-benchmark.types';
import { ProfilingSessionReport } from '../profiling/profiler.types';

export const BASELINE_STORAGE_KEY = 'lensclone_ocr_golden_baseline';

export const FALLBACK_GOLDEN_BASELINE: GoldenBaseline = {
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  description: 'Default built-in golden baseline for LensClone OCR pipeline',
  metrics: {
    detection: {
      precision: 0.90,
      recall: 0.88,
      f1Score: 0.89,
      averageIoU: 0.78,
    },
    recognition: {
      exactMatchRatio: 0.82,
      characterErrorRate: 0.08,
      wordErrorRate: 0.12,
    },
    performance: {
      averagePipelineLatencyMs: 45.0,
      fps: 22.2,
      stageTimingsMs: {
        detector: 18.0,
        detectorFilter: 0.5,
        tracker: 1.2,
        cropper: 3.5,
        recognizer: 15.0,
        dictionaryMatcher: 2.8,
        lineGrouping: 2.0,
        offerExtractor: 2.0,
      },
    },
    memory: {
      peakHeapMb: 42.0,
      bufferPoolHitRate: 0.95,
    },
  },
};

@Injectable({
  providedIn: 'root',
})
export class BaselineManagerService {
  private static memoryOverride: GoldenBaseline | null = null;
  private cachedBaseline: GoldenBaseline | null = null;

  /**
   * Retrieves the active golden baseline (memory override, local storage override, or static JSON asset).
   */
  async getBaseline(assetPath = '/assets/benchmarks/golden-baseline.json'): Promise<GoldenBaseline> {
    if (this.cachedBaseline) {
      return this.cachedBaseline;
    }

    if (BaselineManagerService.memoryOverride) {
      this.cachedBaseline = BaselineManagerService.memoryOverride;
      return this.cachedBaseline;
    }

    // 1. Check local storage override (if in browser)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(BASELINE_STORAGE_KEY);
        if (stored) {
          this.cachedBaseline = JSON.parse(stored) as GoldenBaseline;
          return this.cachedBaseline;
        }
      }
    } catch {
      // Ignore storage access errors in restricted environments
    }

    // 2. Fetch from static assets (valid absolute/relative HTTP URL)
    if (typeof fetch !== 'undefined' && typeof window !== 'undefined' && window.location) {
      try {
        const res = await fetch(assetPath);
        if (res.ok) {
          const data = (await res.json()) as GoldenBaseline;
          this.cachedBaseline = data;
          return data;
        }
      } catch {
        // Fall back to default baseline
      }
    }

    this.cachedBaseline = FALLBACK_GOLDEN_BASELINE;
    return FALLBACK_GOLDEN_BASELINE;
  }

  /**
   * Persists a custom baseline into memory and localStorage.
   */
  saveBaseline(baseline: GoldenBaseline): void {
    BaselineManagerService.memoryOverride = baseline;
    this.cachedBaseline = baseline;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(baseline, null, 2));
      }
    } catch {
      // Ignore storage access errors in restricted environments
    }
  }

  /**
   * Clears custom local baseline and restores default.
   */
  async resetToDefault(assetPath = '/assets/benchmarks/golden-baseline.json'): Promise<GoldenBaseline> {
    BaselineManagerService.memoryOverride = null;
    this.cachedBaseline = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(BASELINE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors
    }
    return this.getBaseline(assetPath);
  }

  /**
   * Builds a new GoldenBaseline snapshot from benchmark dataset evaluation and profiling reports.
   */
  createBaselineFromReports(
    datasetReport: BenchmarkSummaryReport,
    profileReport?: ProfilingSessionReport,
    description = 'Custom Baseline snapshot',
  ): GoldenBaseline {
    const det = datasetReport.overallDetection;
    const rec = datasetReport.overallRecognition;

    const stageTimings: Record<string, number> = {};
    if (profileReport?.stageMetrics) {
      for (const [k, v] of Object.entries(profileReport.stageMetrics)) {
        stageTimings[k] = v.meanMs;
      }
    }

    return {
      version: `1.0.${Date.now()}`,
      createdAt: new Date().toISOString(),
      description,
      metrics: {
        detection: {
          precision: det ? Number(det.precision.toFixed(3)) : 0.9,
          recall: det ? Number(det.recall.toFixed(3)) : 0.88,
          f1Score: det ? Number(det.f1Score.toFixed(3)) : 0.89,
          averageIoU: det ? Number(det.averageIoU.toFixed(3)) : 0.78,
        },
        recognition: {
          exactMatchRatio: rec ? Number(rec.exactMatchRatio.toFixed(3)) : 0.82,
          characterErrorRate: rec ? Number(rec.characterErrorRate.toFixed(3)) : 0.08,
          wordErrorRate: rec ? Number(rec.wordErrorRate.toFixed(3)) : 0.12,
        },
        performance: {
          averagePipelineLatencyMs: profileReport
            ? Number(profileReport.averagePipelineLatencyMs.toFixed(1))
            : Number(datasetReport.averagePipelineLatencyMs.toFixed(1)),
          fps: profileReport ? Number(profileReport.fps.toFixed(1)) : 20.0,
          stageTimingsMs: Object.keys(stageTimings).length > 0 ? stageTimings : undefined,
        },
        memory: profileReport
          ? {
              peakHeapMb: profileReport.memory.peakHeapMb ?? undefined,
              bufferPoolHitRate: profileReport.memory.bufferPoolHitRate ?? 0.95,
            }
          : undefined,
      },
    };
  }
}
