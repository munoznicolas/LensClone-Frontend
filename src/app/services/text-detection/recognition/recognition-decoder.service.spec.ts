import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RecognitionDecoderService } from './recognition-decoder.service';
import type * as ort from 'onnxruntime-web';

describe('RecognitionDecoderService', () => {
  let service: RecognitionDecoderService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RecognitionDecoderService],
    });
    service = TestBed.inject(RecognitionDecoderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize dictionary from YAML file via fetch', async () => {
    const mockYamlContent = 'PostProcess:\n  character_dict:\n    - A\n    - B\n    - C';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(mockYamlContent),
      }),
    );

    await service.initialize();

    const mockTensor = {
      dims: [1, 2, 4],
      data: new Float32Array([
        0, 1.0, 0, 0, // A
        0, 0, 1.0, 0, // B
      ]),
    } as unknown as ort.Tensor;

    const result = service.decode(mockTensor);
    expect(result).toBe('AB');

    vi.unstubAllGlobals();
  });

  it('should throw error when dictionary fetch fails during initialize', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );

    await expect(service.initialize()).rejects.toThrow('Unable to load recognition dictionary.');

    vi.unstubAllGlobals();
  });
});
