import { Injectable } from '@angular/core';
import { PipelineService } from '../pipeline.service';
import { PipelineConfig } from '../pipeline-config.types';
import {
  IterationSample,
  MemoryTelemetry,
  ProfilingSessionOptions,
  ProfilingSessionReport,
  StageStatistic,
} from './profiler.types';

@Injectable({
  providedIn: 'root',
})
export class AlgorithmProfilerService {
  constructor(private readonly pipeline: PipelineService) {}

  /**
   * Computes comprehensive statistics for a set of numeric latency samples in milliseconds.
   */
  computeStats(samples: number[], totalBenchmarkTimeMs?: number): StageStatistic {
    if (samples.length === 0) {
      return {
        count: 0,
        minMs: 0,
        maxMs: 0,
        meanMs: 0,
        medianMs: 0,
        p90Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        stdDevMs: 0,
        opsPerSec: 0,
        totalMs: 0,
        percentageOfTotal: 0,
      };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    const totalMs = sorted.reduce((sum, v) => sum + v, 0);
    const meanMs = totalMs / count;
    const minMs = sorted[0];
    const maxMs = sorted[count - 1];

    const percentile = (p: number): number => {
      const idx = Math.min(count - 1, Math.max(0, Math.floor((p / 100) * count)));
      return sorted[idx];
    };

    const medianMs = percentile(50);
    const p90Ms = percentile(90);
    const p95Ms = percentile(95);
    const p99Ms = percentile(99);

    const variance =
      sorted.reduce((acc, v) => acc + Math.pow(v - meanMs, 2), 0) / count;
    const stdDevMs = Math.sqrt(variance);

    const effectiveTotalTime = totalBenchmarkTimeMs ?? totalMs;
    const opsPerSec =
      effectiveTotalTime > 0 ? (count / effectiveTotalTime) * 1000 : 0;

    return {
      count,
      minMs: Number(minMs.toFixed(3)),
      maxMs: Number(maxMs.toFixed(3)),
      meanMs: Number(meanMs.toFixed(3)),
      medianMs: Number(medianMs.toFixed(3)),
      p90Ms: Number(p90Ms.toFixed(3)),
      p95Ms: Number(p95Ms.toFixed(3)),
      p99Ms: Number(p99Ms.toFixed(3)),
      stdDevMs: Number(stdDevMs.toFixed(3)),
      opsPerSec: Number(opsPerSec.toFixed(2)),
      totalMs: Number(totalMs.toFixed(3)),
      percentageOfTotal: 100,
    };
  }

  /**
   * Reads current JS heap memory if supported by the runtime (e.g. Chrome/Chromium).
   */
  readHeapMemoryMb(): { used: number; total: number; limit: number } | null {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const mem = (performance as any).memory;
      return {
        used: mem.usedJSHeapSize / (1024 * 1024),
        total: mem.totalJSHeapSize / (1024 * 1024),
        limit: mem.jsHeapSizeLimit / (1024 * 1024),
      };
    }
    return null;
  }

  /**
   * Yields execution to the event loop to allow DOM rendering / prevent thread lock.
   */
  async yieldToEventLoop(ms = 0): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Benchmarks a single arbitrary task over specified warmup and test iterations.
   */
  async runBenchmark(
    task: () => void | Promise<void>,
    iterations = 20,
    warmupIterations = 5,
  ): Promise<StageStatistic> {
    // 1. Warmup passes
    for (let i = 0; i < warmupIterations; i++) {
      const res = task();
      if (res instanceof Promise) {
        await res;
      }
    }

    // 2. Timed benchmark passes
    const samples: number[] = [];
    const benchStart = performance.now();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const res = task();
      if (res instanceof Promise) {
        await res;
      }
      samples.push(performance.now() - start);
    }

    const totalBenchmarkTime = performance.now() - benchStart;
    return this.computeStats(samples, totalBenchmarkTime);
  }

  /**
   * Runs a complete multi-iteration profiling session on the full OCR pipeline.
   */
  async profilePipeline(
    image: ImageData,
    config?: PipelineConfig,
    options: ProfilingSessionOptions = {},
  ): Promise<ProfilingSessionReport> {
    const iterations = options.iterations ?? 10;
    const warmupIterations = options.warmupIterations ?? 2;
    const yieldIntervalMs = options.yieldIntervalMs ?? 10;

    await this.pipeline.initialize();

    // Warmup
    for (let w = 0; w < warmupIterations; w++) {
      options.onProgress?.({
        completed: 0,
        total: iterations,
        currentMs: 0,
        status: `Warmup pass ${w + 1}/${warmupIterations}...`,
      });
      await this.pipeline.execute(image, config);
      await this.yieldToEventLoop(5);
    }

    const initialMem = this.readHeapMemoryMb();
    let peakHeap = initialMem?.used ?? 0;

    const iterationSamples: IterationSample[] = [];
    const stageSamplesMap: Record<string, number[]> = {};
    const sessionStart = performance.now();

    for (let i = 0; i < iterations; i++) {
      const iterStart = performance.now();
      await this.pipeline.execute(image, config);
      const iterTotal = performance.now() - iterStart;

      const currentMem = this.readHeapMemoryMb();
      if (currentMem && currentMem.used > peakHeap) {
        peakHeap = currentMem.used;
      }

      const stageMetrics = this.pipeline.stageMetrics() || {};
      for (const [stageName, duration] of Object.entries(stageMetrics)) {
        if (!stageSamplesMap[stageName]) {
          stageSamplesMap[stageName] = [];
        }
        stageSamplesMap[stageName].push(duration);
      }

      iterationSamples.push({
        iteration: i + 1,
        totalMs: Number(iterTotal.toFixed(2)),
        stages: { ...stageMetrics },
      });

      options.onProgress?.({
        completed: i + 1,
        total: iterations,
        currentMs: iterTotal,
        status: `Profiling iteration ${i + 1}/${iterations} complete (${iterTotal.toFixed(1)} ms)...`,
      });

      if (yieldIntervalMs > 0) {
        await this.yieldToEventLoop(yieldIntervalMs);
      }
    }

    const totalDurationMs = performance.now() - sessionStart;
    const totalPipelineLatencies = iterationSamples.map((s) => s.totalMs);
    const pipelineOverallStats = this.computeStats(totalPipelineLatencies);

    // Compute stats per stage and their percentage of total pipeline time
    const stageStats: Record<string, StageStatistic> = {};
    let bottleneckStage = 'unknown';
    let maxStageMean = -1;

    for (const [stageName, samples] of Object.entries(stageSamplesMap)) {
      const stat = this.computeStats(samples);
      const pct =
        pipelineOverallStats.meanMs > 0
          ? Number(((stat.meanMs / pipelineOverallStats.meanMs) * 100).toFixed(1))
          : 0;
      stat.percentageOfTotal = pct;
      stageStats[stageName] = stat;

      if (stat.meanMs > maxStageMean) {
        maxStageMean = stat.meanMs;
        bottleneckStage = stageName;
      }
    }

    const finalMem = this.readHeapMemoryMb();
    const memoryTelemetry: MemoryTelemetry = {
      initialHeapMb: initialMem ? Number(initialMem.used.toFixed(2)) : null,
      finalHeapMb: finalMem ? Number(finalMem.used.toFixed(2)) : null,
      peakHeapMb: Number(peakHeap.toFixed(2)),
      deltaHeapMb:
        initialMem && finalMem
          ? Number((finalMem.used - initialMem.used).toFixed(2))
          : null,
    };

    return {
      timestamp: new Date().toISOString(),
      iterations,
      warmupIterations,
      totalDurationMs: Number(totalDurationMs.toFixed(2)),
      averagePipelineLatencyMs: pipelineOverallStats.meanMs,
      fps: pipelineOverallStats.meanMs > 0 ? Number((1000 / pipelineOverallStats.meanMs).toFixed(1)) : 0,
      stageMetrics: stageStats,
      bottleneckStage,
      memory: memoryTelemetry,
      iterationSamples,
    };
  }
}
