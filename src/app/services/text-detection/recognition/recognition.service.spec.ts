import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RecognitionService } from './recognition.service';
import { RecognitionPreprocessorService } from './recognition-preprocessor.service';
import { RecognitionPostprocessorService } from './recognition-postprocessor.service';
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

describe('RecognitionService', () => {
  let service: RecognitionService;
  let preprocessorMock: any;
  let postprocessorMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    preprocessorMock = {
      initialize: vi.fn(),
      toTensor: vi.fn().mockReturnValue({ dims: [1, 3, 48, 100] }),
      toBatchTensor: vi.fn().mockReturnValue({
        tensor: { dims: [2, 3, 48, 120] },
        widths: [100, 120],
      }),
    };

    postprocessorMock = {
      decode: vi.fn().mockReturnValue(''),
      decodeWithScore: vi.fn().mockReturnValue({ text: 'APPLES', score: 0.95 }),
      decodeBatchWithScore: vi.fn().mockReturnValue([
        { text: 'APPLES', score: 0.95 },
        { text: 'BANANA', score: 0.92 },
      ]),
    };

    TestBed.configureTestingModule({
      providers: [
        RecognitionService,
        { provide: RecognitionPreprocessorService, useValue: preprocessorMock },
        { provide: RecognitionPostprocessorService, useValue: postprocessorMock },
      ],
    });

    service = TestBed.inject(RecognitionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should skip recognition when detections have no crops or are reused without refresh', async () => {
    const state: PipelineState = {
      detections: [
        {
          boundingBoxScore: 0.9,
          boundingBox: { x: 10, y: 10, width: 20, height: 20 },
          isReused: true,
          rawText: 'ALREADY_RECOGNIZED',
          needsRefresh: false,
        },
      ],
      processingTimeMs: 0,
    };

    await service.execute(state);

    expect(preprocessorMock.toTensor).not.toHaveBeenCalled();
    expect(preprocessorMock.toBatchTensor).not.toHaveBeenCalled();
    expect(state.detections[0].rawText).toBe('ALREADY_RECOGNIZED');
  });

  it('should execute batched recognition across multiple cropped detections', async () => {
    // Inject mock session
    (service as any).session = {
      outputNames: ['out'],
      run: vi.fn().mockResolvedValue({
        out: { dims: [2, 20, 837], data: new Float32Array(2 * 20 * 837) },
      }),
    };
    (service as any).dictionary = ['A', 'B', 'C'];

    const mockCrop1 = new ImageData(new Uint8ClampedArray(40 * 20 * 4), 40, 20);
    const mockCrop2 = new ImageData(new Uint8ClampedArray(50 * 25 * 4), 50, 25);

    const state: PipelineState = {
      detections: [
        {
          boundingBoxScore: 0.9,
          boundingBox: { x: 10, y: 10, width: 40, height: 20 },
          crop: mockCrop1,
        },
        {
          boundingBoxScore: 0.85,
          boundingBox: { x: 60, y: 10, width: 50, height: 25 },
          crop: mockCrop2,
        },
      ],
      processingTimeMs: 0,
    };

    await service.execute(state);

    expect(preprocessorMock.toBatchTensor).toHaveBeenCalledWith([mockCrop1, mockCrop2]);
    expect((service as any).session.run).toHaveBeenCalledTimes(1); // 1 single batched forward pass!
    expect(postprocessorMock.decodeBatchWithScore).toHaveBeenCalled();
    expect(state.detections[0].rawText).toBe('APPLES');
    expect(state.detections[1].rawText).toBe('BANANA');
  });
});
