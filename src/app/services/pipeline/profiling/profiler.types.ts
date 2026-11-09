export interface StageStatistic {
  count: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  medianMs: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  stdDevMs: number;
  opsPerSec: number;
  totalMs: number;
  percentageOfTotal: number;
}

export interface MemoryTelemetry {
  initialHeapMb: number | null;
  peakHeapMb: number | null;
  finalHeapMb: number | null;
  deltaHeapMb: number | null;
  bufferPoolAllocations?: number;
  bufferPoolReuses?: number;
  bufferPoolHitRate?: number;
}

export interface IterationSample {
  iteration: number;
  totalMs: number;
  stages: Record<string, number>;
}

export interface ProfilingSessionReport {
  timestamp: string;
  iterations: number;
  warmupIterations: number;
  totalDurationMs: number;
  averagePipelineLatencyMs: number;
  fps: number;
  stageMetrics: Record<string, StageStatistic>;
  bottleneckStage: string;
  memory: MemoryTelemetry;
  iterationSamples: IterationSample[];
}

export interface ProfilingSessionOptions {
  iterations?: number;
  warmupIterations?: number;
  yieldIntervalMs?: number;
  onProgress?: (progress: { completed: number; total: number; currentMs: number; status: string }) => void;
}

export interface MicroBenchmarkDefinition {
  id: string;
  name: string;
  category: 'detection' | 'recognition' | 'postprocessing' | 'memory' | 'nlp';
  description: string;
}

export interface MicroBenchmarkResult {
  id: string;
  name: string;
  category: 'detection' | 'recognition' | 'postprocessing' | 'memory' | 'nlp';
  iterations: number;
  stats: StageStatistic;
  memoryDeltaMb: number;
  throughputDescription: string;
}
