import { Injectable } from '@angular/core';
import {
  DEFAULT_VALIDATION_THRESHOLDS,
  GoldenBaseline,
  MetricComparison,
  MetricStatus,
  ValidationReport,
  ValidationThresholds,
} from './validation.types';
import { BaselineManagerService } from './baseline-manager.service';
import { BenchmarkSummaryReport } from '../benchmark/dataset-benchmark.types';
import { ProfilingSessionReport } from '../profiling/profiler.types';

@Injectable({
  providedIn: 'root',
})
export class PipelineValidationService {
  constructor(private readonly baselineManager: BaselineManagerService) {}

  /**
   * Validates a run against baseline metrics using specified or default thresholds.
   */
  validate(
    datasetReport: BenchmarkSummaryReport,
    profileReport?: ProfilingSessionReport,
    baseline?: GoldenBaseline,
    thresholds: ValidationThresholds = DEFAULT_VALIDATION_THRESHOLDS,
  ): ValidationReport {
    const base = baseline ?? this.baselineManager.createBaselineFromReports(datasetReport);
    const comparisons: MetricComparison[] = [];

    // --- 1. Detection Metrics Validation ---
    const currDet = datasetReport.overallDetection;
    const baseDet = base.metrics.detection;

    if (currDet && baseDet) {
      // F1 Score
      const f1Delta = currDet.f1Score - baseDet.f1Score;
      let f1Status: MetricStatus = 'PASS';
      if (f1Delta < -thresholds.maxF1Drop) {
        f1Status = 'FAIL';
      } else if (f1Delta > 0.01) {
        f1Status = 'IMPROVED';
      }
      comparisons.push({
        category: 'detection',
        metric: 'Detection F1-Score',
        baselineValue: Number(baseDet.f1Score.toFixed(3)),
        currentValue: Number(currDet.f1Score.toFixed(3)),
        delta: Number(f1Delta.toFixed(3)),
        status: f1Status,
        description: `Threshold max drop: ${thresholds.maxF1Drop}`,
      });

      // Average IoU
      const iouDelta = currDet.averageIoU - baseDet.averageIoU;
      let iouStatus: MetricStatus = 'PASS';
      if (iouDelta < -thresholds.maxIoUDrop) {
        iouStatus = 'FAIL';
      } else if (iouDelta > 0.02) {
        iouStatus = 'IMPROVED';
      }
      comparisons.push({
        category: 'detection',
        metric: 'Average Box IoU',
        baselineValue: Number(baseDet.averageIoU.toFixed(3)),
        currentValue: Number(currDet.averageIoU.toFixed(3)),
        delta: Number(iouDelta.toFixed(3)),
        status: iouStatus,
        description: `Threshold max drop: ${thresholds.maxIoUDrop}`,
      });

      // Precision & Recall
      const precDelta = currDet.precision - baseDet.precision;
      comparisons.push({
        category: 'detection',
        metric: 'Detection Precision',
        baselineValue: Number(baseDet.precision.toFixed(3)),
        currentValue: Number(currDet.precision.toFixed(3)),
        delta: Number(precDelta.toFixed(3)),
        status: precDelta < -thresholds.maxF1Drop ? 'WARNING' : precDelta > 0.02 ? 'IMPROVED' : 'PASS',
        description: `Detection Precision`,
      });

      const recDelta = currDet.recall - baseDet.recall;
      comparisons.push({
        category: 'detection',
        metric: 'Detection Recall',
        baselineValue: Number(baseDet.recall.toFixed(3)),
        currentValue: Number(currDet.recall.toFixed(3)),
        delta: Number(recDelta.toFixed(3)),
        status: recDelta < -thresholds.maxF1Drop ? 'WARNING' : recDelta > 0.02 ? 'IMPROVED' : 'PASS',
        description: `Detection Recall`,
      });
    }

    // --- 2. Recognition Metrics Validation ---
    const currRec = datasetReport.overallRecognition;
    const baseRec = base.metrics.recognition;

    if (currRec && baseRec) {
      // Character Error Rate (CER) - lower is better
      const cerDelta = currRec.characterErrorRate - baseRec.characterErrorRate;
      let cerStatus: MetricStatus = 'PASS';
      if (cerDelta > thresholds.maxCERIncrease) {
        cerStatus = 'FAIL';
      } else if (cerDelta < -0.01) {
        cerStatus = 'IMPROVED';
      }
      comparisons.push({
        category: 'recognition',
        metric: 'Character Error Rate (CER)',
        baselineValue: Number(baseRec.characterErrorRate.toFixed(3)),
        currentValue: Number(currRec.characterErrorRate.toFixed(3)),
        delta: Number(cerDelta.toFixed(3)),
        status: cerStatus,
        description: `Threshold max increase: +${thresholds.maxCERIncrease}`,
      });

      // Word Error Rate (WER) - lower is better
      const werDelta = currRec.wordErrorRate - baseRec.wordErrorRate;
      let werStatus: MetricStatus = 'PASS';
      if (werDelta > thresholds.maxWERIncrease) {
        werStatus = 'FAIL';
      } else if (werDelta < -0.01) {
        werStatus = 'IMPROVED';
      }
      comparisons.push({
        category: 'recognition',
        metric: 'Word Error Rate (WER)',
        baselineValue: Number(baseRec.wordErrorRate.toFixed(3)),
        currentValue: Number(currRec.wordErrorRate.toFixed(3)),
        delta: Number(werDelta.toFixed(3)),
        status: werStatus,
        description: `Threshold max increase: +${thresholds.maxWERIncrease}`,
      });

      // Exact Match Ratio - higher is better
      const exactDelta = currRec.exactMatchRatio - baseRec.exactMatchRatio;
      let exactStatus: MetricStatus = 'PASS';
      if (exactDelta < -thresholds.maxExactMatchDrop) {
        exactStatus = 'FAIL';
      } else if (exactDelta > 0.02) {
        exactStatus = 'IMPROVED';
      }
      comparisons.push({
        category: 'recognition',
        metric: 'Exact Match Ratio',
        baselineValue: Number(baseRec.exactMatchRatio.toFixed(3)),
        currentValue: Number(currRec.exactMatchRatio.toFixed(3)),
        delta: Number(exactDelta.toFixed(3)),
        status: exactStatus,
        description: `Threshold max drop: ${thresholds.maxExactMatchDrop}`,
      });
    }

    // --- 3. Performance Metrics Validation ---
    const currLatency = profileReport?.averagePipelineLatencyMs ?? datasetReport.averagePipelineLatencyMs;
    const baseLatency = base.metrics.performance.averagePipelineLatencyMs;

    if (baseLatency > 0 && currLatency > 0) {
      const latencyDeltaMs = currLatency - baseLatency;
      const latencyDeltaPct = (latencyDeltaMs / baseLatency) * 100;

      let latencyStatus: MetricStatus = 'PASS';
      if (latencyDeltaPct > thresholds.maxLatencyIncreasePct) {
        latencyStatus = 'FAIL';
      } else if (latencyDeltaPct < -5) {
        latencyStatus = 'IMPROVED';
      }

      comparisons.push({
        category: 'performance',
        metric: 'Average Pipeline Latency (ms)',
        baselineValue: Number(baseLatency.toFixed(1)),
        currentValue: Number(currLatency.toFixed(1)),
        delta: Number(latencyDeltaMs.toFixed(1)),
        deltaPct: Number(latencyDeltaPct.toFixed(1)),
        status: latencyStatus,
        description: `Max allowed latency increase: +${thresholds.maxLatencyIncreasePct}%`,
      });
    }

    // --- 4. Buffer Pool Memory Check ---
    if (profileReport?.memory.bufferPoolHitRate !== undefined && thresholds.minBufferPoolHitRate) {
      const hitRate = profileReport.memory.bufferPoolHitRate;
      const pass = hitRate >= thresholds.minBufferPoolHitRate;
      comparisons.push({
        category: 'memory',
        metric: 'Tensor Buffer Pool Hit Rate',
        baselineValue: base.metrics.memory?.bufferPoolHitRate ?? 0.95,
        currentValue: hitRate,
        delta: Number((hitRate - (base.metrics.memory?.bufferPoolHitRate ?? 0.95)).toFixed(2)),
        status: pass ? 'PASS' : 'WARNING',
        description: `Target hit rate: >= ${(thresholds.minBufferPoolHitRate * 100).toFixed(0)}%`,
      });
    }

    // Aggregate status and score
    const regressionsCount = comparisons.filter((c) => c.status === 'FAIL').length;
    const warningsCount = comparisons.filter((c) => c.status === 'WARNING').length;
    const improvementsCount = comparisons.filter((c) => c.status === 'IMPROVED').length;
    const overallPassed = regressionsCount === 0;

    // Score: 100 base, -25 per failure, -5 per warning, +2 per improvement (clamped 0-100)
    const rawScore = 100 - regressionsCount * 25 - warningsCount * 5 + improvementsCount * 2;
    const score = Math.max(0, Math.min(100, rawScore));

    const summaryMarkdown = this.generateSummaryMarkdown(
      overallPassed,
      score,
      comparisons,
      regressionsCount,
      improvementsCount,
    );

    return {
      timestamp: new Date().toISOString(),
      overallPassed,
      hasWarnings: warningsCount > 0,
      score,
      comparisons,
      regressionsCount,
      improvementsCount,
      summaryMarkdown,
    };
  }

  /**
   * Generates a clean Markdown summary table of validation results.
   */
  private generateSummaryMarkdown(
    overallPassed: boolean,
    score: number,
    comparisons: MetricComparison[],
    regressions: number,
    improvements: number,
  ): string {
    const statusHeader = overallPassed
      ? `## ✅ VALIDATION PASSED (Score: ${score}/100)`
      : `## ❌ VALIDATION FAILED (${regressions} Regressions Detected)`;

    const lines = [
      statusHeader,
      ``,
      `| Status | Category | Metric | Baseline | Current | Delta | Details |`,
      `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`,
    ];

    for (const c of comparisons) {
      const icon =
        c.status === 'PASS'
          ? '🟢 PASS'
          : c.status === 'IMPROVED'
            ? '🚀 IMPROVED'
            : c.status === 'WARNING'
              ? '🟡 WARN'
              : '🔴 FAIL';

      const deltaStr =
        c.deltaPct !== undefined
          ? `${c.delta >= 0 ? '+' : ''}${c.delta} (${c.deltaPct >= 0 ? '+' : ''}${c.deltaPct}%)`
          : `${c.delta >= 0 ? '+' : ''}${c.delta}`;

      lines.push(
        `| ${icon} | ${c.category} | ${c.metric} | ${c.baselineValue} | ${c.currentValue} | ${deltaStr} | ${c.description} |`,
      );
    }

    lines.push(``);
    lines.push(`**Summary**: ${improvements} improvements, ${regressions} regressions.`);
    return lines.join('\n');
  }
}
