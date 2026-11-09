import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('onnxruntime-web', () => {
  class TensorMock {
    type: string;
    data: any;
    dims: number[];
    constructor(type: string, data: any, dims: number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  }
  const createMock = vi.fn().mockResolvedValue({
    outputNames: ['out'],
    run: vi.fn().mockResolvedValue({ out: {} }),
  });
  const envMock = { wasm: {} };

  return {
    __esModule: true,
    default: {
      env: envMock,
      InferenceSession: { create: createMock },
      Tensor: TensorMock,
    },
    env: envMock,
    InferenceSession: { create: createMock },
    Tensor: TensorMock,
  };
});

import { TestBed } from '@angular/core/testing';
import { RecognitionPreprocessorService } from './recognition-preprocessor.service';

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

describe('RecognitionPreprocessorService', () => {
  let service: RecognitionPreprocessorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RecognitionPreprocessorService],
    });
    service = TestBed.inject(RecognitionPreprocessorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize target input height', () => {
    expect(() => service.initialize(32)).not.toThrow();
  });

  it('should convert input ImageData to tensor with shape [1, 3, inputHeight, targetWidth]', () => {
    service.initialize(32);

    const data = new Uint8ClampedArray(64 * 32 * 4);
    const mockImage = new ImageData(data, 64, 32);

    const tensor = service.toTensor(mockImage);

    expect(tensor).toBeDefined();
    expect(tensor.dims[0]).toBe(1);
    expect(tensor.dims[1]).toBe(3);
    expect(tensor.dims[2]).toBe(32);
  });

  it('should convert multiple input ImageData objects into a batched tensor [B, 3, inputHeight, maxWidth]', () => {
    service.initialize(32);

    const img1 = new ImageData(new Uint8ClampedArray(40 * 20 * 4), 40, 20);
    const img2 = new ImageData(new Uint8ClampedArray(60 * 30 * 4), 60, 30);

    const { tensor, widths } = service.toBatchTensor([img1, img2]);

    expect(tensor).toBeDefined();
    expect(tensor.dims[0]).toBe(2);
    expect(tensor.dims[1]).toBe(3);
    expect(tensor.dims[2]).toBe(32);
    expect(tensor.dims[3]).toBe(Math.max(...widths));
    expect(widths.length).toBe(2);
  });
});
