import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RecognitionPostprocessorService } from './recognition-postprocessor.service';
import type * as ort from 'onnxruntime-web';

describe('RecognitionPostprocessorService', () => {
  let service: RecognitionPostprocessorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RecognitionPostprocessorService],
    });
    service = TestBed.inject(RecognitionPostprocessorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should decode CTC sequence output removing duplicates and blank tokens', () => {
    // Dictionary: ['A', 'B', 'C'] -> 1-based index 1='A', 2='B', 3='C'. Blank=0.
    const dictionary = ['A', 'B', 'C'];
    const sequenceLength = 6;
    const classCount = 4; // 0: blank, 1: A, 2: B, 3: C

    const data = new Float32Array(sequenceLength * classCount);

    // Step 0: A (class 1)
    data[0 * classCount + 1] = 1.0;
    // Step 1: A (class 1) - duplicate
    data[1 * classCount + 1] = 1.0;
    // Step 2: Blank (class 0)
    data[2 * classCount + 0] = 1.0;
    // Step 3: B (class 2)
    data[3 * classCount + 2] = 1.0;
    // Step 4: B (class 2) - duplicate
    data[4 * classCount + 2] = 1.0;
    // Step 5: C (class 3)
    data[5 * classCount + 3] = 1.0;

    const mockTensor = {
      dims: [1, sequenceLength, classCount],
      data: data,
    } as unknown as ort.Tensor;

    const decoded = service.decode(mockTensor, dictionary, 0);

    expect(decoded).toBe('ABC');
  });

  it('should decode batched CTC sequence output across multiple batch items', () => {
    const dictionary = ['A', 'B', 'C'];
    const batchSize = 2;
    const sequenceLength = 3;
    const classCount = 4;

    const data = new Float32Array(batchSize * sequenceLength * classCount);

    // Batch item 0: A -> B -> Blank => "AB"
    data[0 * classCount + 1] = 2.0;
    data[1 * classCount + 2] = 2.0;
    data[2 * classCount + 0] = 2.0;

    // Batch item 1: C -> Blank -> A => "CA"
    const offset1 = sequenceLength * classCount;
    data[offset1 + 0 * classCount + 3] = 2.0;
    data[offset1 + 1 * classCount + 0] = 2.0;
    data[offset1 + 2 * classCount + 1] = 2.0;

    const mockBatchTensor = {
      dims: [batchSize, sequenceLength, classCount],
      data: data,
    } as unknown as ort.Tensor;

    const results = service.decodeBatchWithScore(mockBatchTensor, dictionary, 0);

    expect(results.length).toBe(2);
    expect(results[0].text).toBe('AB');
    expect(results[1].text).toBe('CA');
  });
});
