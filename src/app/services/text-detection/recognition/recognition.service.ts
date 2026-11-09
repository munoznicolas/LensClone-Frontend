import { Injectable } from '@angular/core';
import { RecognitionPreprocessorService } from '../recognition/recognition-preprocessor.service';
import * as ort from 'onnxruntime-web';
import { RecognitionPostprocessorService } from './recognition-postprocessor.service';
import { Detection } from '../types';
import { PipelineStage, PipelineState } from '../../pipeline/pipeline-state';

@Injectable({
  providedIn: 'root',
})
export class RecognitionService implements PipelineStage {
  readonly name = 'recognizer';
  private session!: ort.InferenceSession;
  private dictionary!: string[];

  constructor(
    private readonly preprocessor: RecognitionPreprocessorService,
    private readonly postprocessor: RecognitionPostprocessorService,
  ) {}

  async initialize(): Promise<void> {
    if (ort?.env?.wasm) {
      ort.env.logLevel = 'error';
      ort.env.wasm.proxy = false;
      ort.env.wasm.numThreads =
        typeof navigator !== 'undefined' && navigator.hardwareConcurrency
          ? navigator.hardwareConcurrency
          : 4;
      ort.env.wasm.wasmPaths = '/assets/ort/';
    }

    const buffer = await this.pullModel('/models/latin_PP-OCRv5_mobile_rec.onnx');
    this.session = await ort.InferenceSession.create(buffer, {
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'all',
      logSeverityLevel: 3,
    });
    this.preprocessor.initialize(48);
    this.dictionary = (await fetch('/models/dictionary.txt').then((r) => r.text()))
      .split(/\r?\n/)
      .filter(Boolean);
  }

  async execute(state: PipelineState): Promise<void> {
    const pendingDetections = state.detections.filter(
      (d) => (!d.isReused || !d.rawText || d.needsRefresh) && !!d.crop,
    );

    if (pendingDetections.length === 0) {
      return;
    }

    const BATCH_SIZE = 6;

    for (let i = 0; i < pendingDetections.length; i += BATCH_SIZE) {
      const batch = pendingDetections.slice(i, i + BATCH_SIZE);
      const crops = batch.map((d) => d.crop!);

      try {
        if (crops.length === 1) {
          const output = await this.session.run({
            x: this.preprocessor.toTensor(crops[0]),
          });
          const maps = output[this.session.outputNames[0]] as ort.Tensor;
          const res = this.postprocessor.decodeWithScore(maps, this.dictionary, 836);
          batch[0].rawText = res.text;
          batch[0].rawTextScore = res.score;
        } else {
          const { tensor } = this.preprocessor.toBatchTensor(crops);
          const output = await this.session.run({ x: tensor });
          const maps = output[this.session.outputNames[0]] as ort.Tensor;
          const results = this.postprocessor.decodeBatchWithScore(
            maps,
            this.dictionary,
            836,
          );

          for (let j = 0; j < batch.length; j++) {
            batch[j].rawText = results[j]?.text || '';
            batch[j].rawTextScore = results[j]?.score || 0;
          }
        }
      } catch (err) {
        console.warn(
          'Batch recognition execution failed, falling back to sequential execution:',
          err,
        );
        for (const detection of batch) {
          if (!detection.crop) continue;
          const output = await this.session.run({
            x: this.preprocessor.toTensor(detection.crop),
          });
          const maps = output[this.session.outputNames[0]] as ort.Tensor;
          const res = this.postprocessor.decodeWithScore(maps, this.dictionary, 836);
          detection.rawText = res.text;
          detection.rawTextScore = res.score;
        }
      }
    }
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
