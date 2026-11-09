import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DetectorPostprocessorService } from './detector-postprocessor.service';
import type * as ort from 'onnxruntime-web';

describe('DetectorPostprocessorService', () => {
  let service: DetectorPostprocessorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DetectorPostprocessorService],
    });
    service = TestBed.inject(DetectorPostprocessorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should threshold tensor output and compute bounding boxes for connected components', () => {
    // Create a 1x1x10x10 tensor with a 4x4 region of high confidence (> 0.3)
    const width = 10;
    const height = 10;
    const data = new Float32Array(width * height);

    // Fill a 4x4 box at (2, 2) to (5, 5) with score 0.9 (area = 16 >= minArea 10)
    for (let y = 2; y <= 5; y++) {
      for (let x = 2; x <= 5; x++) {
        data[y * width + x] = 0.9;
      }
    }

    const mockTensor = {
      dims: [1, 1, height, width],
      data: data,
    } as unknown as ort.Tensor;

    const detections = service.process(mockTensor, 100, 100);

    expect(detections.length).toBe(1);
    expect(detections[0].boundingBoxScore).toBeCloseTo(0.9, 2);
    expect(detections[0].boundingBox.x).toBe(20);
    expect(detections[0].boundingBox.y).toBe(20);
    expect(detections[0].boundingBox.width).toBe(30);
    expect(detections[0].boundingBox.height).toBe(30);
  });

  it('should ignore components smaller than minArea (10 pixels)', () => {
    const width = 10;
    const height = 10;
    const data = new Float32Array(width * height);

    // 2x2 box (area = 4 < 10)
    data[0] = 0.9;
    data[1] = 0.9;
    data[width] = 0.9;
    data[width + 1] = 0.9;

    const mockTensor = {
      dims: [1, 1, height, width],
      data: data,
    } as unknown as ort.Tensor;

    const detections = service.process(mockTensor, 100, 100);

    expect(detections.length).toBe(0);
  });
});
