import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('onnxruntime-web', () => {
  const createMock = vi.fn().mockResolvedValue({
    outputNames: ['out'],
    run: vi.fn().mockResolvedValue({ out: {} }),
  });
  const tensorMock = vi.fn().mockImplementation((type: any, data: any, dims: any) => ({
    type,
    data,
    dims,
  }));
  const envMock = { wasm: { numThreads: 4, proxy: false, logLevel: 'error', wasmPaths: '/assets/ort/' } };

  return {
    __esModule: true,
    default: {
      env: envMock,
      InferenceSession: { create: createMock },
      Tensor: tensorMock,
    },
    env: envMock,
    InferenceSession: { create: createMock },
    Tensor: tensorMock,
  };
});

import { TestBed } from '@angular/core/testing';
import { DetectorService } from './detector.service';
import { DetectorPreprocessorService } from './detector-preprocessor.service';
import { DetectorPostprocessorService } from './detector-postprocessor.service';
import * as ort from 'onnxruntime-web';
import { PipelineState } from '../../pipeline/pipeline-state';

if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

describe('DetectorService', () => {
  let service: DetectorService;
  let preprocessorMock: DetectorPreprocessorService;
  let postprocessorMock: DetectorPostprocessorService;

  beforeEach(() => {
    vi.clearAllMocks();

    preprocessorMock = {
      toTensor: vi.fn().mockReturnValue({} as ort.Tensor),
    } as unknown as DetectorPreprocessorService;

    postprocessorMock = {
      process: vi.fn().mockReturnValue([
        {
          boundingBoxScore: 0.95,
          boundingBox: { x: 10, y: 10, width: 20, height: 20 },
        },
      ]),
    } as unknown as DetectorPostprocessorService;

    TestBed.configureTestingModule({
      providers: [
        DetectorService,
        { provide: DetectorPreprocessorService, useValue: preprocessorMock },
        { provide: DetectorPostprocessorService, useValue: postprocessorMock },
      ],
    });

    service = TestBed.inject(DetectorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize ONNX inference session after fetching model binary', async () => {
    const dummyBuffer = new ArrayBuffer(2000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        arrayBuffer: vi.fn().mockResolvedValue(dummyBuffer),
      }),
    );

    const mockSession = { outputNames: ['out'] };
    (ort.InferenceSession.create as any).mockResolvedValue(mockSession);

    await service.initialize?.();

    expect(fetch).toHaveBeenCalledWith('/models/PP-OCRv5_mobile_det.onnx');
    expect(ort.InferenceSession.create).toHaveBeenCalledWith(
      dummyBuffer,
      expect.objectContaining({
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all',
      }),
    );
    expect(ort.env.wasm.numThreads).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });

  it('should execute preprocessing, model inference, and postprocessing', async () => {
    const dummyBuffer = new ArrayBuffer(2000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        arrayBuffer: vi.fn().mockResolvedValue(dummyBuffer),
      }),
    );

    const mockOutput = { out: { dims: [1, 1, 10, 10], data: new Float32Array(100) } };
    const mockSession = {
      outputNames: ['out'],
      run: vi.fn().mockResolvedValue(mockOutput),
    };
    (ort.InferenceSession.create as any).mockResolvedValue(mockSession);

    await service.initialize?.();

    const mockImage = new ImageData(new Uint8ClampedArray(400), 10, 10);
    const state: PipelineState = {
      fullImage: mockImage,
      detections: [],
      processingTimeMs: 0,
    };

    await service.execute(state);

    expect(preprocessorMock.toTensor).toHaveBeenCalledWith(mockImage, undefined, undefined);
    expect(mockSession.run).toHaveBeenCalled();
    expect(postprocessorMock.process).toHaveBeenCalledWith(
      mockOutput.out,
      10,
      10,
      undefined,
    );
    expect(state.detections.length).toBe(1);
    expect(state.detections[0].boundingBoxScore).toBe(0.95);

    vi.unstubAllGlobals();
  });

  it('should pass detector maxSide and scaleFactor config to preprocessor', async () => {
    const dummyBuffer = new ArrayBuffer(2000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        arrayBuffer: vi.fn().mockResolvedValue(dummyBuffer),
      }),
    );

    const mockSession = {
      outputNames: ['out'],
      run: vi.fn().mockResolvedValue({ out: {} }),
    };
    (ort.InferenceSession.create as any).mockResolvedValue(mockSession);

    await service.initialize?.();

    const mockImage = new ImageData(new Uint8ClampedArray(400), 10, 10);
    const state: PipelineState = {
      fullImage: mockImage,
      detections: [],
      processingTimeMs: 0,
      config: {
        detector: {
          thresholdValue: 0.25,
          minArea: 15,
          minAspectRatio: 1.5,
          maxSide: 480,
          scaleFactor: 0.75,
        },
        cropper: { padding: 4, paddingMode: 'fixed' },
        recognizer: { targetHeight: 48 },
        lineGrouping: {
          maxScore: 1.0,
          weights: { vertical: 0.6, height: 0.25, horizontal: 0.1, confidence: 0.05 },
          limits: { maxVertical: 1.0, maxHeightRatio: 2.0 },
        },
        dictionary: { similarityThreshold: 0.7, priceMin: 1000, priceMax: 9999 },
        tracking: { enabled: true, iouThreshold: 0.3, maxMisses: 3, smoothingFactor: 0.6, refreshIntervalFrames: 30 },
      },
    };

    await service.execute(state);

    expect(preprocessorMock.toTensor).toHaveBeenCalledWith(mockImage, 480, 0.75);

    vi.unstubAllGlobals();
  });

  it('should skip DBNet model run on interleaved frames when intervalFrames > 1 and reuse previous detections', async () => {
    const dummyBuffer = new ArrayBuffer(2000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        arrayBuffer: vi.fn().mockResolvedValue(dummyBuffer),
      }),
    );

    const mockOutput = { out: { dims: [1, 1, 10, 10], data: new Float32Array(100) } };
    const mockSession = {
      outputNames: ['out'],
      run: vi.fn().mockResolvedValue(mockOutput),
    };
    (ort.InferenceSession.create as any).mockResolvedValue(mockSession);

    await service.initialize?.();

    const mockImage = new ImageData(new Uint8ClampedArray(400), 10, 10);
    const config = {
      detector: {
        thresholdValue: 0.2,
        minArea: 10,
        minAspectRatio: 1.4,
        intervalFrames: 3,
      },
      cropper: { padding: 6, paddingMode: 'fixed' as const },
      recognizer: { targetHeight: 48 },
      lineGrouping: {
        maxScore: 0.8,
        weights: { vertical: 0.3, height: 0.25, horizontal: 0.1, confidence: 0.05 },
        limits: { maxVertical: 1.0, maxHeightRatio: 2.0 },
      },
      dictionary: { similarityThreshold: 0.65, priceMin: 1000, priceMax: 9999 },
      tracking: { enabled: true, iouThreshold: 0.3, maxMisses: 3, smoothingFactor: 0.6, refreshIntervalFrames: 30 },
    };

    // Frame 1: Runs DBNet
    const state1: PipelineState = { fullImage: mockImage, detections: [], processingTimeMs: 0, config };
    await service.execute(state1);
    expect(mockSession.run).toHaveBeenCalledTimes(1);
    expect(state1.detections.length).toBe(1);

    // Frame 2: Skips DBNet, reuses detections with isReused: true
    const state2: PipelineState = { fullImage: mockImage, detections: [], processingTimeMs: 0, config };
    await service.execute(state2);
    expect(mockSession.run).toHaveBeenCalledTimes(1); // Still 1!
    expect(state2.detections.length).toBe(1);
    expect(state2.detections[0].isReused).toBe(true);

    // Frame 3: Skips DBNet, reuses detections
    const state3: PipelineState = { fullImage: mockImage, detections: [], processingTimeMs: 0, config };
    await service.execute(state3);
    expect(mockSession.run).toHaveBeenCalledTimes(1); // Still 1!
    expect(state3.detections.length).toBe(1);
    expect(state3.detections[0].isReused).toBe(true);

    // Frame 4: intervalFrames=3 -> runs DBNet again!
    const state4: PipelineState = { fullImage: mockImage, detections: [], processingTimeMs: 0, config };
    await service.execute(state4);
    expect(mockSession.run).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});
