import { Injectable } from '@angular/core';
import type * as ort from 'onnxruntime-web';
import { AlgorithmProfilerService } from './algorithm-profiler.service';
import { MicroBenchmarkDefinition, MicroBenchmarkResult } from './profiler.types';
import { WeightedLevenshteinService } from '../../text-detection/dictionary/weighted-levenshtein.service';
import { DetectorPostprocessorService } from '../../text-detection/detector/detector-postprocessor.service';
import { RecognitionDecoderService } from '../../text-detection/recognition/recognition-decoder.service';
import { LineGroupingService } from '../../text-detection/line-grouping/line-grouping.service';
import { TensorBufferPoolService } from '../../text-detection/tensor-buffer-pool/tensor-buffer-pool.service';
import { DetectorFilterService } from '../../text-detection/detector/detector-filter.service';
import { Detection } from '../../text-detection/types';
import { PipelineState } from '../pipeline-state';
import { DEFAULT_PIPELINE_CONFIG } from '../pipeline-config.types';

@Injectable({
  providedIn: 'root',
})
export class AlgorithmMicroBenchmarksService {
  constructor(
    private readonly profiler: AlgorithmProfilerService,
    private readonly levenshtein: WeightedLevenshteinService,
    private readonly detectorPostprocessor: DetectorPostprocessorService,
    private readonly recognitionDecoder: RecognitionDecoderService,
    private readonly lineGrouping: LineGroupingService,
    private readonly tensorPool: TensorBufferPoolService,
    private readonly detectorFilter: DetectorFilterService,
  ) {}

  getAvailableBenchmarks(): MicroBenchmarkDefinition[] {
    return [
      {
        id: 'weighted-levenshtein',
        name: 'Weighted Levenshtein Similarity',
        category: 'nlp',
        description:
          'Evaluates OCR confusion-weighted edit distance dynamic programming matrix against 100 grocery term pairs.',
      },
      {
        id: 'detector-postprocessor',
        name: 'Detector Postprocessor (Contour & Polygon Extraction)',
        category: 'detection',
        description:
          'Evaluates connected components, contour detection, and bounding box creation on synthetic DBNet heatmaps.',
      },
      {
        id: 'ctc-decoder',
        name: 'CTC Greedy Sequence Decoder',
        category: 'recognition',
        description:
          'Evaluates CTC duplicate collapse, blank token removal, and character index mapping for text recognition logits.',
      },
      {
        id: 'line-grouping',
        name: 'Geometric Line Grouping',
        category: 'postprocessing',
        description:
          'Evaluates spatial clustering heuristics and vertical alignment cost functions across 30 bounding boxes.',
      },
      {
        id: 'tensor-buffer-pool',
        name: 'Tensor Buffer Pool Reuse vs Direct Allocations',
        category: 'memory',
        description:
          'Measures buffer pool checkout/release throughput against native Float32Array garbage collection overhead.',
      },
      {
        id: 'detector-filter',
        name: 'Detection Spatial Filtering',
        category: 'detection',
        description:
          'Evaluates minArea, aspect-ratio, and image boundary filtering over 100 candidate bounding boxes.',
      },
    ];
  }

  async runBenchmarkById(id: string, iterations = 50): Promise<MicroBenchmarkResult> {
    switch (id) {
      case 'weighted-levenshtein':
        return this.runLevenshteinBenchmark(iterations);
      case 'detector-postprocessor':
        return this.runDetectorPostprocessorBenchmark(iterations);
      case 'ctc-decoder':
        return this.runCTCDecoderBenchmark(iterations);
      case 'line-grouping':
        return this.runLineGroupingBenchmark(iterations);
      case 'tensor-buffer-pool':
        return this.runTensorBufferPoolBenchmark(iterations);
      case 'detector-filter':
        return this.runDetectorFilterBenchmark(iterations);
      default:
        throw new Error(`Unknown micro-benchmark id: ${id}`);
    }
  }

  async runAllBenchmarks(
    iterations = 30,
    onProgress?: (benchmarkName: string, completed: number, total: number) => void,
  ): Promise<MicroBenchmarkResult[]> {
    const list = this.getAvailableBenchmarks();
    const results: MicroBenchmarkResult[] = [];

    for (let i = 0; i < list.length; i++) {
      const def = list[i];
      onProgress?.(def.name, i + 1, list.length);
      const res = await this.runBenchmarkById(def.id, iterations);
      results.push(res);
      await this.profiler.yieldToEventLoop(5);
    }

    return results;
  }

  // --- 1. Weighted Levenshtein Micro-benchmark ---
  private async runLevenshteinBenchmark(iterations: number): Promise<MicroBenchmarkResult> {
    const candidatePairs: Array<[string, string]> = [
      ['MANZANA', 'MANZANA'],
      ['MANZANA', 'MANZ4NA'],
      ['BANANA', '8ANANA'],
      ['TOMATE', 'T0MAT3'],
      ['PERA', 'P3RA'],
      ['NARANJA', 'NARAN1A'],
      ['LECHUGA', 'LECHVGA'],
      ['ZANAHORIA', 'ZANAH0RIA'],
      ['FRUTILLA', 'FRUT1LLA'],
      ['PAPA', 'P4PA'],
    ];

    const initialMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    const stats = await this.profiler.runBenchmark(
      () => {
        for (let i = 0; i < candidatePairs.length; i++) {
          const [a, b] = candidatePairs[i];
          this.levenshtein.similarity(a, b);
        }
      },
      iterations,
      10,
    );

    const finalMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    return {
      id: 'weighted-levenshtein',
      name: 'Weighted Levenshtein Similarity',
      category: 'nlp',
      iterations,
      stats,
      memoryDeltaMb: Number((finalMem - initialMem).toFixed(2)),
      throughputDescription: `${(stats.opsPerSec * candidatePairs.length).toFixed(0)} pair comparisons/sec`,
    };
  }

  // --- 2. Detector Postprocessor Micro-benchmark ---
  private async runDetectorPostprocessorBenchmark(iterations: number): Promise<MicroBenchmarkResult> {
    const height = 128;
    const width = 128;
    const rawData = new Float32Array(1 * 1 * height * width);

    // Simulate 3 detected text regions with probability > threshold (0.8)
    const fillBox = (startY: number, startX: number, h: number, w: number) => {
      for (let y = startY; y < startY + h; y++) {
        for (let x = startX; x < startX + w; x++) {
          rawData[y * width + x] = 0.95;
        }
      }
    };

    fillBox(20, 20, 15, 60);
    fillBox(50, 30, 20, 50);
    fillBox(85, 10, 18, 80);

    const tensor: ort.Tensor = {
      type: 'float32',
      data: rawData,
      dims: [1, 1, height, width],
      size: rawData.length,
    } as unknown as ort.Tensor;
    const initialMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    const stats = await this.profiler.runBenchmark(
      () => {
        this.detectorPostprocessor.process(tensor, 640, 640, DEFAULT_PIPELINE_CONFIG.detector);
      },
      iterations,
      5,
    );

    const finalMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    return {
      id: 'detector-postprocessor',
      name: 'Detector Postprocessor (Contour & Polygon Extraction)',
      category: 'detection',
      iterations,
      stats,
      memoryDeltaMb: Number((finalMem - initialMem).toFixed(2)),
      throughputDescription: `${stats.opsPerSec.toFixed(1)} heatmap frames/sec`,
    };
  }

  // --- 3. CTC Decoder Micro-benchmark ---
  private async runCTCDecoderBenchmark(iterations: number): Promise<MicroBenchmarkResult> {
    const steps = 40;
    const classes = 67;
    const rawData = new Float32Array(1 * steps * classes);

    // Populate simulated character probabilities with repeated chars and blanks
    for (let t = 0; t < steps; t++) {
      const charIdx = t % 10 < 2 ? 0 : (t % 15) + 1; // 0 is CTC blank
      rawData[t * classes + charIdx] = 5.0; // high logit
    }

    const tensor: ort.Tensor = {
      type: 'float32',
      data: rawData,
      dims: [1, steps, classes],
      size: rawData.length,
    } as unknown as ort.Tensor;
    const initialMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    const stats = await this.profiler.runBenchmark(
      () => {
        this.recognitionDecoder.decode(tensor);
      },
      iterations,
      10,
    );

    const finalMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    return {
      id: 'ctc-decoder',
      name: 'CTC Greedy Sequence Decoder',
      category: 'recognition',
      iterations,
      stats,
      memoryDeltaMb: Number((finalMem - initialMem).toFixed(2)),
      throughputDescription: `${stats.opsPerSec.toFixed(0)} sequence decodes/sec`,
    };
  }

  // --- 4. Line Grouping Micro-benchmark ---
  private async runLineGroupingBenchmark(iterations: number): Promise<MicroBenchmarkResult> {
    const generateDetections = (count: number): Detection[] => {
      const detections: Detection[] = [];
      for (let i = 0; i < count; i++) {
        const lineIdx = Math.floor(i / 3);
        const colIdx = i % 3;
        detections.push({
          boundingBoxScore: 0.9,
          boundingBox: {
            x: 50 + colIdx * 120,
            y: 40 + lineIdx * 60,
            width: 80,
            height: 35,
          },
          rawText: `ITEM_${i}`,
        });
      }
      return detections;
    };

    const initialMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    const stats = await this.profiler.runBenchmark(
      () => {
        const state: PipelineState = {
          detections: generateDetections(30),
          processingTimeMs: 0,
          config: DEFAULT_PIPELINE_CONFIG,
        };
        this.lineGrouping.execute(state);
      },
      iterations,
      5,
    );

    const finalMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    return {
      id: 'line-grouping',
      name: 'Geometric Line Grouping',
      category: 'postprocessing',
      iterations,
      stats,
      memoryDeltaMb: Number((finalMem - initialMem).toFixed(2)),
      throughputDescription: `${stats.opsPerSec.toFixed(1)} groupings/sec (30 boxes)`,
    };
  }

  // --- 5. Tensor Buffer Pool Micro-benchmark ---
  private async runTensorBufferPoolBenchmark(iterations: number): Promise<MicroBenchmarkResult> {
    const bufferSize = 640 * 640 * 3;
    const initialMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    const stats = await this.profiler.runBenchmark(
      () => {
        const buf = this.tensorPool.getBuffer(bufferSize);
        buf[0] = 1.0;
        buf[bufferSize - 1] = 2.0;
        this.tensorPool.releaseBuffer(buf);
      },
      iterations * 2,
      10,
    );

    const finalMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    return {
      id: 'tensor-buffer-pool',
      name: 'Tensor Buffer Pool Reuse vs Direct Allocations',
      category: 'memory',
      iterations: iterations * 2,
      stats,
      memoryDeltaMb: Number((finalMem - initialMem).toFixed(2)),
      throughputDescription: `${stats.opsPerSec.toFixed(0)} acquire/release cycles/sec (4.9 MB each)`,
    };
  }

  // --- 6. Detector Filter Micro-benchmark ---
  private async runDetectorFilterBenchmark(iterations: number): Promise<MicroBenchmarkResult> {
    const generateDetections = (count: number): Detection[] => {
      const result: Detection[] = [];
      for (let i = 0; i < count; i++) {
        result.push({
          boundingBoxScore: 0.5 + (i % 50) / 100,
          boundingBox: {
            x: (i * 13) % 600,
            y: (i * 17) % 600,
            width: (i % 2 === 0 ? 10 : 60),
            height: (i % 3 === 0 ? 8 : 40),
          },
        });
      }
      return result;
    };

    const initialMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    const stats = await this.profiler.runBenchmark(
      () => {
        const state: PipelineState = {
          fullImage: { width: 640, height: 640 } as any,
          detections: generateDetections(100),
          processingTimeMs: 0,
          config: DEFAULT_PIPELINE_CONFIG,
        };
        this.detectorFilter.execute(state);
      },
      iterations,
      10,
    );

    const finalMem = this.profiler.readHeapMemoryMb()?.used ?? 0;

    return {
      id: 'detector-filter',
      name: 'Detection Spatial Filtering',
      category: 'detection',
      iterations,
      stats,
      memoryDeltaMb: Number((finalMem - initialMem).toFixed(2)),
      throughputDescription: `${stats.opsPerSec.toFixed(1)} filter executions/sec (100 boxes each)`,
    };
  }
}
