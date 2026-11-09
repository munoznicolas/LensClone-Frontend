import { Injectable } from '@angular/core';
import * as ort from 'onnxruntime-web';
import { DetectorPreprocessorService } from './detector-preprocessor.service';
import { DetectorPostprocessorService } from './detector-postprocessor.service';
import { Detection } from '../types';
import { PipelineStage, PipelineState } from '../../pipeline/pipeline-state';

@Injectable({
  providedIn: 'root',
})
export class DetectorService implements PipelineStage {
  readonly name = 'detector';
  private session!: ort.InferenceSession;
  private frameCount = 0;
  private previousDetections: Detection[] = [];

  constructor(
    private readonly preprocessor: DetectorPreprocessorService,
    private readonly postprocessor: DetectorPostprocessorService,
  ) {}

  async initialize?(): Promise<void> {
    if (ort?.env?.wasm) {
      ort.env.logLevel = 'error';
      ort.env.wasm.proxy = false;
      ort.env.wasm.numThreads =
        typeof navigator !== 'undefined' && navigator.hardwareConcurrency
          ? navigator.hardwareConcurrency
          : 4;
      ort.env.wasm.wasmPaths = '/assets/ort/';
    }

    const buffer = await this.pullModel('/models/PP-OCRv5_mobile_det.onnx');
    this.session = await ort.InferenceSession.create(buffer, {
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'all',
      logSeverityLevel: 3,
    });
  }

  async execute(state: PipelineState): Promise<void> {
    const interval = Math.max(1, state.config?.detector?.intervalFrames ?? 1);
    this.frameCount++;

    // When interleaved skipping is active (interval > 1) and we have previous detections,
    // skip the heavy DBNet forward pass and reuse previous detections as tracked candidates.
    if (interval > 1 && this.frameCount % interval !== 1 && this.previousDetections.length > 0) {
      state.detections = this.previousDetections.map((det) => ({
        ...det,
        isReused: true,
      }));
      return;
    }

    // Preprocess the image with optional aspect-bounding downscaling or scale factor
    const tensor = this.preprocessor.toTensor(
      state.fullImage!,
      state.config?.detector?.maxSide,
      state.config?.detector?.scaleFactor,
    );
    // Run the model
    const output = await this.session.run({
      x: tensor,
    });
    // Postprocess the output to get detections
    const detections = this.postprocessor.process(
      output[this.session.outputNames[0]] as ort.Tensor,
      state.fullImage!.width,
      state.fullImage!.height,
      state.config?.detector,
    );
    // Update the state with the new detections
    this.previousDetections = detections;
    state.detections = detections;
  }

  reset(): void {
    this.frameCount = 0;
    this.previousDetections = [];
  }

  private async pullModel(modelUrl: string): Promise<ArrayBuffer> {
    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(
        `Detector Model file not reachable: ${response.status} ${response.statusText} at ${modelUrl}`,
      );
    }

    const contentType = response.headers.get('content-type');
    const buffer = await response.arrayBuffer();

    if (contentType?.includes('text/html') || buffer.byteLength < 1000) {
      throw new Error(
        `Detector Model file looks invalid (content-type: ${contentType}, size: ${buffer.byteLength} bytes). ` +
          `Likely a dev-server fallback or a Git LFS pointer file instead of the real model.`,
      );
    }
    return buffer;
  }
}
