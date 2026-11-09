import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlgorithmProfilerService } from './algorithm-profiler.service';
import { PipelineService } from '../pipeline.service';

describe('AlgorithmProfilerService', () => {
  let profiler: AlgorithmProfilerService;
  let pipelineSpy: any;

  beforeEach(() => {
    pipelineSpy = {
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue(undefined),
      stageMetrics: vi.fn().mockReturnValue({
        detector: 12.5,
        cropper: 3.2,
        recognizer: 18.0,
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        AlgorithmProfilerService,
        { provide: PipelineService, useValue: pipelineSpy },
      ],
    });

    profiler = TestBed.inject(AlgorithmProfilerService);
  });

  it('should be created', () => {
    expect(profiler).toBeTruthy();
  });

  describe('computeStats', () => {
    it('should correctly calculate min, max, mean, median, percentiles and stddev', () => {
      const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const stats = profiler.computeStats(samples, 550);

      expect(stats.count).toBe(10);
      expect(stats.minMs).toBe(10);
      expect(stats.maxMs).toBe(100);
      expect(stats.meanMs).toBe(55);
      expect(stats.medianMs).toBe(60);
      expect(stats.p90Ms).toBe(100);
      expect(stats.opsPerSec).toBeCloseTo((10 / 550) * 1000, 1);
      expect(stats.stdDevMs).toBeGreaterThan(0);
    });

    it('should handle empty sample list gracefully', () => {
      const stats = profiler.computeStats([]);
      expect(stats.count).toBe(0);
      expect(stats.meanMs).toBe(0);
      expect(stats.opsPerSec).toBe(0);
    });
  });

  describe('runBenchmark', () => {
    it('should run task for warmup and specified iterations', async () => {
      let runCount = 0;
      const task = () => {
        runCount++;
      };

      const stats = await profiler.runBenchmark(task, 10, 3);

      expect(runCount).toBe(13); // 3 warmup + 10 iterations
      expect(stats.count).toBe(10);
      expect(stats.meanMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('profilePipeline', () => {
    it('should profile pipeline over multiple iterations and return aggregated report', async () => {
      const mockImage = {
        width: 100,
        height: 100,
        data: new Uint8ClampedArray(40000),
      } as unknown as ImageData;

      const report = await profiler.profilePipeline(mockImage, undefined, {
        iterations: 3,
        warmupIterations: 1,
        yieldIntervalMs: 0,
      });

      expect(pipelineSpy.initialize).toHaveBeenCalled();
      expect(pipelineSpy.execute).toHaveBeenCalledTimes(4); // 1 warmup + 3 runs
      expect(report.iterations).toBe(3);
      expect(report.warmupIterations).toBe(1);
      expect(report.stageMetrics['detector']).toBeDefined();
      expect(report.stageMetrics['cropper']).toBeDefined();
      expect(report.stageMetrics['recognizer']).toBeDefined();
      expect(report.bottleneckStage).toBe('recognizer');
      expect(report.iterationSamples.length).toBe(3);
    });
  });
});
