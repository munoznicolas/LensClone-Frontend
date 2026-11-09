import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineValidationService } from './pipeline-validation.service';
import { BaselineManagerService, FALLBACK_GOLDEN_BASELINE } from './baseline-manager.service';
import { BenchmarkSummaryReport } from '../benchmark/dataset-benchmark.types';
import { ProfilingSessionReport } from '../profiling/profiler.types';
import { GoldenBaseline } from './validation.types';

describe('PipelineValidationService', () => {
  let service: PipelineValidationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PipelineValidationService, BaselineManagerService],
    });
    service = TestBed.inject(PipelineValidationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should pass validation when current metrics match or exceed baseline', () => {
    const baseline: GoldenBaseline = {
      ...FALLBACK_GOLDEN_BASELINE,
      metrics: {
        ...FALLBACK_GOLDEN_BASELINE.metrics,
        detection: {
          precision: 0.9,
          recall: 0.85,
          f1Score: 0.87,
          averageIoU: 0.75,
        },
        recognition: {
          exactMatchRatio: 0.8,
          characterErrorRate: 0.08,
          wordErrorRate: 0.12,
        },
        performance: {
          averagePipelineLatencyMs: 50.0,
          fps: 20.0,
        },
      },
    };

    const datasetReport: BenchmarkSummaryReport = {
      timestamp: new Date().toISOString(),
      totalSamplesEvaluated: 1,
      overallDetection: {
        truePositives: 10,
        falsePositives: 1,
        falseNegatives: 1,
        precision: 0.91,
        recall: 0.88,
        f1Score: 0.89, // +0.02 improvement
        averageIoU: 0.77, // +0.02 improvement
      },
      overallRecognition: {
        totalSamples: 10,
        exactMatches: 8,
        exactMatchRatio: 0.82,
        characterErrorRate: 0.07, // improvement
        wordErrorRate: 0.11, // improvement
        averageEditDistance: 1,
      },
      averagePipelineLatencyMs: 48.0, // improvement
      sampleResults: [],
    };

    const validation = service.validate(datasetReport, undefined, baseline);

    expect(validation.overallPassed).toBe(true);
    expect(validation.regressionsCount).toBe(0);
    expect(validation.score).toBeGreaterThanOrEqual(100);
    expect(validation.summaryMarkdown).toContain('VALIDATION PASSED');
  });

  it('should detect regression and fail validation when F1 or CER regresses past threshold', () => {
    const baseline = FALLBACK_GOLDEN_BASELINE; // F1: 0.89, CER: 0.08, Latency: 45ms

    const regressedReport: BenchmarkSummaryReport = {
      timestamp: new Date().toISOString(),
      totalSamplesEvaluated: 1,
      overallDetection: {
        truePositives: 7,
        falsePositives: 4,
        falseNegatives: 4,
        precision: 0.63,
        recall: 0.63,
        f1Score: 0.63, // severely dropped from 0.89 (-0.26)
        averageIoU: 0.50, // dropped from 0.78 (-0.28)
      },
      overallRecognition: {
        totalSamples: 10,
        exactMatches: 5,
        exactMatchRatio: 0.5,
        characterErrorRate: 0.25, // worsened from 0.08 (+0.17)
        wordErrorRate: 0.35,
        averageEditDistance: 3,
      },
      averagePipelineLatencyMs: 80.0, // spiked from 45ms (+77%)
      sampleResults: [],
    };

    const validation = service.validate(regressedReport, undefined, baseline);

    expect(validation.overallPassed).toBe(false);
    expect(validation.regressionsCount).toBeGreaterThan(0);
    expect(validation.score).toBeLessThan(50);
    expect(validation.summaryMarkdown).toContain('VALIDATION FAILED');

    const f1Diff = validation.comparisons.find((c) => c.metric === 'Detection F1-Score');
    expect(f1Diff?.status).toBe('FAIL');

    const cerDiff = validation.comparisons.find((c) => c.metric === 'Character Error Rate (CER)');
    expect(cerDiff?.status).toBe('FAIL');

    const latencyDiff = validation.comparisons.find((c) => c.metric === 'Average Pipeline Latency (ms)');
    expect(latencyDiff?.status).toBe('FAIL');
  });
});
