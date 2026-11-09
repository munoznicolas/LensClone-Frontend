import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugComponent } from './debug.component';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { CameraService } from '../../services/camera/camera.service';
import { AlgorithmProfilerService } from '../../services/pipeline/profiling/algorithm-profiler.service';
import { AlgorithmMicroBenchmarksService } from '../../services/pipeline/profiling/algorithm-micro-benchmarks.service';
import { PipelineValidationService } from '../../services/pipeline/validation/pipeline-validation.service';
import { BaselineManagerService } from '../../services/pipeline/validation/baseline-manager.service';
import { computed, signal } from '@angular/core';

describe('DebugComponent', () => {
  let component: DebugComponent;
  let fixture: ComponentFixture<DebugComponent>;
  let pipelineServiceMock: any;
  let profilerMock: any;
  let microbenchMock: any;
  let validatorMock: any;
  let baselineManagerMock: any;

  beforeEach(async () => {
    const mockContext = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      drawImage: vi.fn(),
      getImageData: vi.fn(),
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockContext as unknown as CanvasRenderingContext2D,
    );

    const stateSignal = signal({ fullImage: undefined, detections: [], processingTimeMs: 0 } as any);

    pipelineServiceMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn(),
      state: stateSignal,
      detections: computed(() => stateSignal().detections),
      processingTimeMs: computed(() => stateSignal().processingTimeMs),
      fps: computed(() => (stateSignal().processingTimeMs > 0 ? 1000 / stateSignal().processingTimeMs : 0)),
      stageMetrics: computed(() => stateSignal().stageMetrics),
      cropsCount: computed(() => (stateSignal().detections || []).filter((d: any) => !!d.crop).length),
      hasDetections: computed(() => (stateSignal().detections || []).length > 0),
      groupedLines: computed(() => []),
      offers: computed(() => stateSignal().offers ?? []),
      debugSettings: signal({
        croppedRegions: true,
        boundingBoxes: true,
        recognizedText: true,
        canonicalText: true,
        lineGrouping: true,
      }),
    };

    const cameraServiceMock = {
      start: vi.fn().mockResolvedValue(undefined),
    };

    profilerMock = {
      profilePipeline: vi.fn().mockResolvedValue({
        timestamp: new Date().toISOString(),
        iterations: 5,
        warmupIterations: 2,
        totalDurationMs: 250,
        averagePipelineLatencyMs: 40.0,
        fps: 25.0,
        stageMetrics: {
          detector: {
            count: 5,
            minMs: 15,
            maxMs: 20,
            meanMs: 17.5,
            medianMs: 17,
            p90Ms: 19,
            p95Ms: 20,
            p99Ms: 20,
            stdDevMs: 1.5,
            opsPerSec: 57,
            totalMs: 87.5,
            percentageOfTotal: 43.8,
          },
        },
        bottleneckStage: 'detector',
        memory: {
          initialHeapMb: 50,
          finalHeapMb: 51,
          peakHeapMb: 52,
          deltaHeapMb: 1,
        },
        iterationSamples: [],
      }),
    };

    microbenchMock = {
      runAllBenchmarks: vi.fn().mockResolvedValue([
        {
          id: 'weighted-levenshtein',
          name: 'Weighted Levenshtein Similarity',
          category: 'nlp',
          iterations: 30,
          stats: { meanMs: 0.05, p95Ms: 0.1, opsPerSec: 20000 },
          memoryDeltaMb: 0,
          throughputDescription: '20000 ops/sec',
        },
      ]),
    };

    validatorMock = {
      validate: vi.fn().mockReturnValue({
        timestamp: new Date().toISOString(),
        overallPassed: true,
        hasWarnings: false,
        score: 100,
        comparisons: [],
        regressionsCount: 0,
        improvementsCount: 1,
        summaryMarkdown: 'PASS',
      }),
    };

    baselineManagerMock = {
      getBaseline: vi.fn().mockResolvedValue({
        version: '1.0.0',
        metrics: {
          detection: { f1Score: 0.9, averageIoU: 0.8 },
          recognition: { exactMatchRatio: 0.85, characterErrorRate: 0.07 },
          performance: { averagePipelineLatencyMs: 45.0, fps: 22.0 },
        },
      }),
      createBaselineFromReports: vi.fn().mockReturnValue({}),
      saveBaseline: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DebugComponent],
      providers: [
        { provide: PipelineService, useValue: pipelineServiceMock },
        { provide: CameraService, useValue: cameraServiceMock },
        { provide: AlgorithmProfilerService, useValue: profilerMock },
        { provide: AlgorithmMicroBenchmarksService, useValue: microbenchMock },
        { provide: PipelineValidationService, useValue: validatorMock },
        { provide: BaselineManagerService, useValue: baselineManagerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DebugComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create debug component', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle debug settings via pipeline service signal', () => {
    const initialVal = pipelineServiceMock.debugSettings().boundingBoxes;
    component.toggle('boundingBoxes');
    expect(pipelineServiceMock.debugSettings().boundingBoxes).toBe(!initialVal);
  });

  it('should render individual pipeline stage metrics from pipeline state', () => {
    pipelineServiceMock.state.set({
      fullImage: undefined,
      detections: [],
      processingTimeMs: 42.5,
      stageMetrics: {
        detector: 12.3,
        detectorFilter: 1.1,
        cropper: 4.2,
        recognizer: 20.4,
        dictionary: 3.0,
        lineGrouping: 1.5,
      },
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const statsText = compiled.querySelector('.stats')?.textContent;

    expect(statsText).toContain('Total: 42.5 ms (23.5 FPS)');
    expect(statsText).toContain('Detector Time: 12.3 ms');
    expect(statsText).toContain('Filter Time: 1.1 ms');
    expect(statsText).toContain('Cropper Time: 4.2 ms');
    expect(statsText).toContain('Recognizer Time: 20.4 ms');
    expect(statsText).toContain('Dictionary Time: 3 ms');
    expect(statsText).toContain('Line Grouping Time: 1.5 ms');
  });

  it('should update memory stats when performance.memory is available', () => {
    const memoryObj = {
      usedJSHeapSize: 50 * 1024 * 1024,
      totalJSHeapSize: 100 * 1024 * 1024,
      jsHeapSizeLimit: 2048 * 1024 * 1024,
    };
    vi.stubGlobal('performance', { memory: memoryObj });

    component.updateMemoryStats();
    fixture.detectChanges();

    expect(component.currentHeapMb()).toBeCloseTo(50, 1);
    expect(component.totalHeapMb()).toBeCloseTo(100, 1);
    expect(component.limitHeapMb()).toBeCloseTo(2048, 0);

    const memoryPanelText = (fixture.nativeElement as HTMLElement).querySelector('.memory')?.textContent;
    expect(memoryPanelText).toContain('Used Heap: 50.0 MB');
    expect(memoryPanelText).toContain('Peak Heap: 50.0 MB');
    expect(memoryPanelText).toContain('Total Heap: 100.0 MB');

    vi.unstubAllGlobals();
  });

  it('should run profiling session and update profiling signals', async () => {
    component.activeTab.set('profiler');
    await component.runProfilingSession();
    fixture.detectChanges();

    expect(profilerMock.profilePipeline).toHaveBeenCalled();
    expect(component.profileReport()).not.toBeNull();
    expect(component.profileReport()?.bottleneckStage).toBe('detector');
    expect(validatorMock.validate).toHaveBeenCalled();
    expect(component.validationReport()?.overallPassed).toBe(true);
  });

  it('should run micro-benchmarks and populate micro-bench results', async () => {
    component.activeTab.set('microbench');
    await component.runMicroBenchmarks();
    fixture.detectChanges();

    expect(microbenchMock.runAllBenchmarks).toHaveBeenCalled();
    expect(component.microBenchResults().length).toBe(1);
    expect(component.microBenchResults()[0].id).toBe('weighted-levenshtein');
  });
});
