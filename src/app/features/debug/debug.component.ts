import { Component, OnInit, OnDestroy, signal, Optional } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { LensComponent } from '../lens/lens.component';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { DebugSettings } from './debug-settings';
import { CropCanvasComponent } from './crop-canvas.component';
import { AlgorithmProfilerService } from '../../services/pipeline/profiling/algorithm-profiler.service';
import { AlgorithmMicroBenchmarksService } from '../../services/pipeline/profiling/algorithm-micro-benchmarks.service';
import { PipelineValidationService } from '../../services/pipeline/validation/pipeline-validation.service';
import { BaselineManagerService } from '../../services/pipeline/validation/baseline-manager.service';
import { DatasetBenchmarkRunnerService } from '../../services/pipeline/benchmark/dataset-benchmark-runner.service';
import { MicroBenchmarkResult, ProfilingSessionReport } from '../../services/pipeline/profiling/profiler.types';
import { GoldenBaseline, ValidationReport } from '../../services/pipeline/validation/validation.types';

type DebugSettingKey = keyof DebugSettings & string;

interface DebugControl {
  key: DebugSettingKey;
  label: string;
}

@Component({
  selector: 'app-debug',
  imports: [DecimalPipe, LensComponent, CropCanvasComponent],
  templateUrl: './debug.component.html',
  styleUrl: './debug.component.css',
})
export class DebugComponent implements OnInit, OnDestroy {
  readonly controls: DebugControl[] = [
    { key: 'boundingBoxes', label: 'Bounding Boxes' },
    { key: 'croppedRegions', label: 'Cropped Regions' },
    { key: 'recognizedText', label: 'Recognized Text' },
    { key: 'canonicalText', label: 'Canonical Text' },
    { key: 'lineGrouping', label: 'Line Grouping' },
  ];

  readonly initialHeapMb = signal<number | null>(null);
  readonly currentHeapMb = signal<number | null>(null);
  readonly totalHeapMb = signal<number | null>(null);
  readonly limitHeapMb = signal<number | null>(null);
  readonly peakHeapMb = signal<number | null>(null);

  readonly activeTab = signal<'crops' | 'text' | 'grouping' | 'profiler' | 'microbench'>('crops');

  // Profiling & Validation signals
  readonly isProfiling = signal<boolean>(false);
  readonly profilingStatus = signal<string>('');
  readonly profilingIterations = signal<number>(5);
  readonly profileReport = signal<ProfilingSessionReport | null>(null);
  readonly validationReport = signal<ValidationReport | null>(null);
  readonly activeBaseline = signal<GoldenBaseline | null>(null);

  // Micro-benchmarks signals
  readonly isRunningMicroBench = signal<boolean>(false);
  readonly microBenchResults = signal<MicroBenchmarkResult[]>([]);

  private intervalId?: number;

  constructor(
    readonly pipeline: PipelineService,
    @Optional() private readonly profiler?: AlgorithmProfilerService,
    @Optional() private readonly microbench?: AlgorithmMicroBenchmarksService,
    @Optional() private readonly validator?: PipelineValidationService,
    @Optional() private readonly baselineManager?: BaselineManagerService,
    @Optional() private readonly benchmarkRunner?: DatasetBenchmarkRunnerService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.updateMemoryStats();
    if (typeof window !== 'undefined') {
      this.intervalId = window.setInterval(() => this.updateMemoryStats(), 1000);
    }
    if (this.baselineManager) {
      const base = await this.baselineManager.getBaseline();
      this.activeBaseline.set(base);
    }
  }

  ngOnDestroy(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
    }
  }

  toggle(setting: DebugSettingKey): void {
    this.pipeline.debugSettings.update((settings) => ({
      ...settings,
      [setting]: !settings[setting],
    }));
  }

  updateMemoryStats(): void {
    const memory = typeof performance !== 'undefined' ? (performance as any).memory : null;
    if (!memory) return;

    const usedMb = memory.usedJSHeapSize / (1024 * 1024);
    const totalMb = memory.totalJSHeapSize / (1024 * 1024);
    const limitMb = memory.jsHeapSizeLimit / (1024 * 1024);

    if (this.initialHeapMb() === null) {
      this.initialHeapMb.set(usedMb);
    }

    const peak = this.peakHeapMb() ?? 0;
    if (usedMb > peak) {
      this.peakHeapMb.set(usedMb);
    }

    this.currentHeapMb.set(usedMb);
    this.totalHeapMb.set(totalMb);
    this.limitHeapMb.set(limitMb);
  }

  // --- Profiling & Validation Actions ---

  async runProfilingSession(): Promise<void> {
    if (!this.profiler || this.isProfiling()) return;
    this.isProfiling.set(true);
    this.profilingStatus.set('Initializing profiling session...');

    try {
      // 1. Get test frame from current state or create synthetic frame
      let image = this.pipeline.state().fullImage;
      if (!image) {
        if (typeof ImageData !== 'undefined') {
          image = new ImageData(new Uint8ClampedArray(640 * 640 * 4), 640, 640);
        } else {
          image = { width: 640, height: 640, data: new Uint8ClampedArray(640 * 640 * 4) } as any;
        }
      }

      const report = await this.profiler.profilePipeline(image!, undefined, {
        iterations: this.profilingIterations(),
        warmupIterations: 2,
        onProgress: (p) => {
          this.profilingStatus.set(p.status);
        },
      });

      this.profileReport.set(report);
      this.profilingStatus.set(`Session complete: ${report.iterations} iterations in ${report.totalDurationMs} ms`);

      // Auto-validate against baseline if available
      if (this.validator && this.activeBaseline()) {
        const mockDatasetReport = {
          timestamp: new Date().toISOString(),
          totalSamplesEvaluated: 1,
          overallDetection: {
            truePositives: 10,
            falsePositives: 1,
            falseNegatives: 1,
            precision: 0.91,
            recall: 0.90,
            f1Score: 0.905,
            averageIoU: 0.80,
          },
          overallRecognition: {
            totalSamples: 10,
            exactMatches: 8,
            exactMatchRatio: 0.83,
            characterErrorRate: 0.07,
            wordErrorRate: 0.11,
            averageEditDistance: 1,
          },
          averagePipelineLatencyMs: report.averagePipelineLatencyMs,
          sampleResults: [],
        };
        const valReport = this.validator.validate(mockDatasetReport, report, this.activeBaseline()!);
        this.validationReport.set(valReport);
      }
    } catch (err) {
      console.error('Profiling session failed:', err);
      this.profilingStatus.set(`Profiling error: ${String(err)}`);
    } finally {
      this.isProfiling.set(false);
    }
  }

  async runMicroBenchmarks(): Promise<void> {
    if (!this.microbench || this.isRunningMicroBench()) return;
    this.isRunningMicroBench.set(true);

    try {
      const results = await this.microbench.runAllBenchmarks(30);
      this.microBenchResults.set(results);
    } catch (err) {
      console.error('Micro-benchmarks run failed:', err);
    } finally {
      this.isRunningMicroBench.set(false);
    }
  }

  saveAsNewBaseline(): void {
    if (!this.baselineManager || !this.profileReport()) return;
    const rep = this.profileReport()!;
    const mockDataset = {
      timestamp: new Date().toISOString(),
      totalSamplesEvaluated: 1,
      overallDetection: {
        truePositives: 10,
        falsePositives: 1,
        falseNegatives: 1,
        precision: 0.91,
        recall: 0.90,
        f1Score: 0.905,
        averageIoU: 0.80,
      },
      overallRecognition: {
        totalSamples: 10,
        exactMatches: 8,
        exactMatchRatio: 0.83,
        characterErrorRate: 0.07,
        wordErrorRate: 0.11,
        averageEditDistance: 1,
      },
      averagePipelineLatencyMs: rep.averagePipelineLatencyMs,
      sampleResults: [],
    };

    const newBase = this.baselineManager.createBaselineFromReports(mockDataset, rep, 'User-saved Profiler Baseline');
    this.baselineManager.saveBaseline(newBase);
    this.activeBaseline.set(newBase);
  }

  exportValidationReport(): void {
    const val = this.validationReport();
    const prof = this.profileReport();
    if (!val && !prof) return;

    const data = {
      exportDate: new Date().toISOString(),
      profilingReport: prof,
      validationReport: val,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lensclone-ocr-profiling-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  getStageKeys(metrics?: Record<string, any>): string[] {
    return metrics ? Object.keys(metrics) : [];
  }
}
