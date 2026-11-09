import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { AlgorithmMicroBenchmarksService } from './algorithm-micro-benchmarks.service';
import { AlgorithmProfilerService } from './algorithm-profiler.service';
import { WeightedLevenshteinService } from '../../text-detection/dictionary/weighted-levenshtein.service';
import { DetectorPostprocessorService } from '../../text-detection/detector/detector-postprocessor.service';
import { RecognitionDecoderService } from '../../text-detection/recognition/recognition-decoder.service';
import { LineGroupingService } from '../../text-detection/line-grouping/line-grouping.service';
import { TensorBufferPoolService } from '../../text-detection/tensor-buffer-pool/tensor-buffer-pool.service';
import { DetectorFilterService } from '../../text-detection/detector/detector-filter.service';
import { PipelineService } from '../pipeline.service';

describe('AlgorithmMicroBenchmarksService', () => {
  let service: AlgorithmMicroBenchmarksService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AlgorithmMicroBenchmarksService,
        AlgorithmProfilerService,
        WeightedLevenshteinService,
        DetectorPostprocessorService,
        RecognitionDecoderService,
        LineGroupingService,
        TensorBufferPoolService,
        DetectorFilterService,
        {
          provide: PipelineService,
          useValue: {
            initialize: () => Promise.resolve(),
            execute: () => Promise.resolve(),
            stageMetrics: () => ({}),
          },
        },
      ],
    });

    service = TestBed.inject(AlgorithmMicroBenchmarksService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should provide available benchmark definitions', () => {
    const benchmarks = service.getAvailableBenchmarks();
    expect(benchmarks.length).toBeGreaterThanOrEqual(5);
    expect(benchmarks.some((b) => b.id === 'weighted-levenshtein')).toBe(true);
    expect(benchmarks.some((b) => b.id === 'detector-postprocessor')).toBe(true);
    expect(benchmarks.some((b) => b.id === 'line-grouping')).toBe(true);
  });

  it('should execute weighted levenshtein benchmark successfully', async () => {
    const result = await service.runBenchmarkById('weighted-levenshtein', 5);
    expect(result.id).toBe('weighted-levenshtein');
    expect(result.stats.count).toBe(5);
    expect(result.stats.opsPerSec).toBeGreaterThan(0);
  });

  it('should execute detector postprocessor benchmark successfully', async () => {
    const result = await service.runBenchmarkById('detector-postprocessor', 3);
    expect(result.id).toBe('detector-postprocessor');
    expect(result.stats.count).toBe(3);
    expect(result.stats.meanMs).toBeGreaterThanOrEqual(0);
  });

  it('should execute line grouping benchmark successfully', async () => {
    const result = await service.runBenchmarkById('line-grouping', 3);
    expect(result.id).toBe('line-grouping');
    expect(result.stats.count).toBe(3);
  });

  it('should execute tensor buffer pool benchmark successfully', async () => {
    const result = await service.runBenchmarkById('tensor-buffer-pool', 5);
    expect(result.id).toBe('tensor-buffer-pool');
    expect(result.stats.count).toBe(10);
  });

  it('should execute detector filter benchmark successfully', async () => {
    const result = await service.runBenchmarkById('detector-filter', 5);
    expect(result.id).toBe('detector-filter');
    expect(result.stats.count).toBe(5);
  });

  it('should throw error for invalid benchmark id', async () => {
    await expect(service.runBenchmarkById('non-existent')).rejects.toThrow();
  });
});
