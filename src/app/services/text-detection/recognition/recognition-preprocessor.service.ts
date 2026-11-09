import { Injectable } from '@angular/core';
import * as ort from 'onnxruntime-web';
import { TensorBufferPoolService } from '../tensor-buffer-pool/tensor-buffer-pool.service';

@Injectable({
  providedIn: 'root',
})
export class RecognitionPreprocessorService {
  private inputHeight = 48;
  private currentWidth = 0;
  private floatData?: Float32Array;
  private tensor?: ort.Tensor;

  constructor(private readonly bufferPool: TensorBufferPoolService) {}

  initialize(inputHeight: number): void {
    this.inputHeight = inputHeight;
  }

  /**
   * Directly resamples crop ImageData to targetHeight with bilinear interpolation,
   * normalizes RGB channels to [0, 1], and formats into an ONNX tensor [1, 3, targetHeight, targetWidth]
   * completely bypassing DOM canvas creation and readbacks.
   */
  toTensor(image: ImageData): ort.Tensor {
    const srcW = image.width;
    const srcH = image.height;
    const scale = this.inputHeight / Math.max(1, srcH);
    const targetWidth = Math.max(1, Math.round(srcW * scale));

    this.ensureBuffer(targetWidth);

    const dstH = this.inputHeight;
    const dstW = targetWidth;
    const area = dstW * dstH;
    const srcData = image.data;
    const floatData = this.floatData!;

    const xRatio = srcW / dstW;
    const yRatio = srcH / dstH;

    for (let y = 0; y < dstH; y++) {
      const srcY = (y + 0.5) * yRatio - 0.5;
      const y1 = Math.max(0, Math.floor(srcY));
      const y2 = Math.min(srcH - 1, y1 + 1);
      const yWeight = Math.max(0, Math.min(1, srcY - y1));

      const rowOffset = y * dstW;

      for (let x = 0; x < dstW; x++) {
        const srcX = (x + 0.5) * xRatio - 0.5;
        const x1 = Math.max(0, Math.floor(srcX));
        const x2 = Math.min(srcW - 1, x1 + 1);
        const xWeight = Math.max(0, Math.min(1, srcX - x1));

        const idx11 = (y1 * srcW + x1) * 4;
        const idx12 = (y1 * srcW + x2) * 4;
        const idx21 = (y2 * srcW + x1) * 4;
        const idx22 = (y2 * srcW + x2) * 4;

        const w11 = (1 - xWeight) * (1 - yWeight);
        const w12 = xWeight * (1 - yWeight);
        const w21 = (1 - xWeight) * yWeight;
        const w22 = xWeight * yWeight;

        const r =
          srcData[idx11] * w11 +
          srcData[idx12] * w12 +
          srcData[idx21] * w21 +
          srcData[idx22] * w22;
        const g =
          srcData[idx11 + 1] * w11 +
          srcData[idx12 + 1] * w12 +
          srcData[idx21 + 1] * w21 +
          srcData[idx22 + 1] * w22;
        const b =
          srcData[idx11 + 2] * w11 +
          srcData[idx12 + 2] * w12 +
          srcData[idx21 + 2] * w21 +
          srcData[idx22 + 2] * w22;

        const dstIdx = rowOffset + x;
        floatData[dstIdx] = r / 255;
        floatData[area + dstIdx] = g / 255;
        floatData[2 * area + dstIdx] = b / 255;
      }
    }

    return this.tensor!;
  }

  /**
   * Resamples multiple crop ImageData objects and bundles them into a single batched ONNX tensor
   * of shape [batchSize, 3, targetHeight, maxWidth], right-padded with neutral zeros.
   */
  toBatchTensor(images: ImageData[]): { tensor: ort.Tensor; widths: number[] } {
    if (images.length === 0) {
      throw new Error('toBatchTensor called with empty images array');
    }
    if (images.length === 1) {
      const tensor = this.toTensor(images[0]);
      return { tensor, widths: [tensor.dims[3]] };
    }

    const batchSize = images.length;
    const dstH = this.inputHeight;
    const widths: number[] = [];

    for (let i = 0; i < batchSize; i++) {
      const scale = dstH / Math.max(1, images[i].height);
      const w = Math.max(1, Math.round(images[i].width * scale));
      widths.push(w);
    }

    const maxWidth = Math.max(...widths);
    const itemArea = maxWidth * dstH;
    const totalFloats = batchSize * 3 * itemArea;

    const batchBuffer = this.bufferPool.getBuffer(totalFloats);
    batchBuffer.fill(0); // Zero-fill padding for right side

    for (let b = 0; b < batchSize; b++) {
      const img = images[b];
      const srcW = img.width;
      const srcH = img.height;
      const srcData = img.data;
      const dstW = widths[b];

      const xRatio = srcW / dstW;
      const yRatio = srcH / dstH;

      const batchItemOffset = b * 3 * itemArea;
      const channelGOffset = batchItemOffset + itemArea;
      const channelBOffset = batchItemOffset + 2 * itemArea;

      for (let y = 0; y < dstH; y++) {
        const srcY = (y + 0.5) * yRatio - 0.5;
        const y1 = Math.max(0, Math.floor(srcY));
        const y2 = Math.min(srcH - 1, y1 + 1);
        const yWeight = Math.max(0, Math.min(1, srcY - y1));

        const rowOffset = y * maxWidth;

        for (let x = 0; x < dstW; x++) {
          const srcX = (x + 0.5) * xRatio - 0.5;
          const x1 = Math.max(0, Math.floor(srcX));
          const x2 = Math.min(srcW - 1, x1 + 1);
          const xWeight = Math.max(0, Math.min(1, srcX - x1));

          const idx11 = (y1 * srcW + x1) * 4;
          const idx12 = (y1 * srcW + x2) * 4;
          const idx21 = (y2 * srcW + x1) * 4;
          const idx22 = (y2 * srcW + x2) * 4;

          const w11 = (1 - xWeight) * (1 - yWeight);
          const w12 = xWeight * (1 - yWeight);
          const w21 = (1 - xWeight) * yWeight;
          const w22 = xWeight * yWeight;

          const r =
            srcData[idx11] * w11 +
            srcData[idx12] * w12 +
            srcData[idx21] * w21 +
            srcData[idx22] * w22;
          const g =
            srcData[idx11 + 1] * w11 +
            srcData[idx12 + 1] * w12 +
            srcData[idx21 + 1] * w21 +
            srcData[idx22 + 1] * w22;
          const bVal =
            srcData[idx11 + 2] * w11 +
            srcData[idx12 + 2] * w12 +
            srcData[idx21 + 2] * w21 +
            srcData[idx22 + 2] * w22;

          const pixelIdx = rowOffset + x;
          batchBuffer[batchItemOffset + pixelIdx] = r / 255;
          batchBuffer[channelGOffset + pixelIdx] = g / 255;
          batchBuffer[channelBOffset + pixelIdx] = bVal / 255;
        }
      }
    }

    const tensor = new ort.Tensor('float32', batchBuffer, [batchSize, 3, dstH, maxWidth]);
    return { tensor, widths };
  }

  private ensureBuffer(targetWidth: number): void {
    if (this.currentWidth !== targetWidth || !this.floatData) {
      this.currentWidth = targetWidth;
      const requiredSize = 3 * targetWidth * this.inputHeight;

      if (this.floatData) {
        this.bufferPool.releaseBuffer(this.floatData);
      }

      this.floatData = this.bufferPool.getBuffer(requiredSize);
      this.tensor = new ort.Tensor('float32', this.floatData, [
        1,
        3,
        this.inputHeight,
        targetWidth,
      ]);
    }
  }
}
