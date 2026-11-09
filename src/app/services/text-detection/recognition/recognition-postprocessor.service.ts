import { Injectable } from '@angular/core';
import * as ort from 'onnxruntime-web';

export interface RecognitionResult {
  text: string;
  score: number;
}

@Injectable({
  providedIn: 'root',
})
export class RecognitionPostprocessorService {
  decode(output: ort.Tensor, dictionary: string[], blankIndex = 0): string {
    return this.decodeWithScore(output, dictionary, blankIndex).text;
  }

  decodeWithScore(output: ort.Tensor, dictionary: string[], blankIndex = 0): RecognitionResult {
    const data = output.data as Float32Array;
    const [, sequenceLength, classCount] = output.dims;

    let previous = -1;
    let text = '';
    const charScores: number[] = [];

    for (let t = 0; t < sequenceLength; t++) {
      let bestClass = 0;
      let bestLogit = -Infinity;
      const offset = t * classCount;

      let maxLogit = -Infinity;
      for (let c = 0; c < classCount; c++) {
        if (data[offset + c] > maxLogit) {
          maxLogit = data[offset + c];
        }
      }

      let expSum = 0;
      for (let c = 0; c < classCount; c++) {
        const val = Math.exp(data[offset + c] - maxLogit);
        expSum += val;
        if (data[offset + c] > bestLogit) {
          bestLogit = data[offset + c];
          bestClass = c;
        }
      }

      const bestProb = Math.exp(bestLogit - maxLogit) / (expSum || 1);

      if (bestClass === blankIndex) {
        previous = bestClass;
        continue;
      }

      if (bestClass === previous) {
        continue;
      }

      const character = dictionary[bestClass - 1];

      if (character) {
        text += character;
        charScores.push(bestProb);
      }

      previous = bestClass;
    }

    const avgScore =
      charScores.length > 0
        ? charScores.reduce((sum, s) => sum + s, 0) / charScores.length
        : 0;

    return {
      text,
      score: Number(avgScore.toFixed(3)),
    };
  }

  /**
   * Decodes a batched output tensor of shape [batchSize, sequenceLength, classCount]
   * by slicing the contiguous buffer for each batch item with zero copies.
   */
  decodeBatchWithScore(
    output: ort.Tensor,
    dictionary: string[],
    blankIndex = 0,
  ): RecognitionResult[] {
    const data = output.data as Float32Array;
    const [batchSize, sequenceLength, classCount] = output.dims;
    const results: RecognitionResult[] = [];
    const sliceLength = sequenceLength * classCount;

    for (let b = 0; b < batchSize; b++) {
      const sliceData = data.subarray(b * sliceLength, (b + 1) * sliceLength);
      const sliceTensor = {
        data: sliceData,
        dims: [1, sequenceLength, classCount],
      } as unknown as ort.Tensor;

      results.push(this.decodeWithScore(sliceTensor, dictionary, blankIndex));
    }

    return results;
  }
}
