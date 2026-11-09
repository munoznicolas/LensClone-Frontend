import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BaselineManagerService,
  FALLBACK_GOLDEN_BASELINE,
} from './baseline-manager.service';
import { BenchmarkSummaryReport } from '../benchmark/dataset-benchmark.types';

describe('BaselineManagerService', () => {
  let service: BaselineManagerService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [BaselineManagerService],
    });
    service = TestBed.inject(BaselineManagerService);
    await service.resetToDefault();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return fallback baseline if asset not found', async () => {
    const baseline = await service.getBaseline('/non-existent-path.json');
    expect(baseline).toBeDefined();
    expect(baseline.metrics.detection.f1Score).toBe(FALLBACK_GOLDEN_BASELINE.metrics.detection.f1Score);
  });

  it('should save and load custom baseline', async () => {
    const customBaseline = {
      ...FALLBACK_GOLDEN_BASELINE,
      description: 'Custom Test Baseline',
      metrics: {
        ...FALLBACK_GOLDEN_BASELINE.metrics,
        detection: {
          ...FALLBACK_GOLDEN_BASELINE.metrics.detection,
          f1Score: 0.95,
        },
      },
    };

    service.saveBaseline(customBaseline);

    const freshService = new BaselineManagerService();
    const loaded = await freshService.getBaseline();

    expect(loaded.description).toBe('Custom Test Baseline');
    expect(loaded.metrics.detection.f1Score).toBe(0.95);
  });

  it('should create new baseline snapshot from dataset report', () => {
    const mockReport: BenchmarkSummaryReport = {
      timestamp: new Date().toISOString(),
      totalSamplesEvaluated: 1,
      overallDetection: {
        truePositives: 10,
        falsePositives: 1,
        falseNegatives: 1,
        precision: 0.91,
        recall: 0.91,
        f1Score: 0.91,
        averageIoU: 0.85,
      },
      overallRecognition: {
        totalSamples: 10,
        exactMatches: 8,
        exactMatchRatio: 0.8,
        characterErrorRate: 0.05,
        wordErrorRate: 0.1,
        averageEditDistance: 1,
      },
      averagePipelineLatencyMs: 35.5,
      sampleResults: [],
    };

    const baseline = service.createBaselineFromReports(mockReport);

    expect(baseline.metrics.detection.f1Score).toBe(0.91);
    expect(baseline.metrics.recognition.characterErrorRate).toBe(0.05);
    expect(baseline.metrics.performance.averagePipelineLatencyMs).toBe(35.5);
  });
});
