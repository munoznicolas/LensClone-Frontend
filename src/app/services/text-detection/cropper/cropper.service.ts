import { Injectable } from '@angular/core';
import { Detection } from '../types';
import { PipelineStage, PipelineState } from '../../pipeline/pipeline-state';
import { DEFAULT_PIPELINE_CONFIG, CropperConfig } from '../../pipeline/pipeline-config.types';

@Injectable({
  providedIn: 'root',
})
export class DetectorCropperService implements PipelineStage {
  readonly name = 'cropper';

  execute(state: PipelineState): void {
    if (state.detections.length === 0 || !state.fullImage) {
      return;
    }

    const cropperConfig = state.config?.cropper ?? DEFAULT_PIPELINE_CONFIG.cropper;
    const fullImage = state.fullImage;

    state.detections = state.detections.map((detection) => {
      if (detection.isReused && !detection.needsRefresh) {
        return detection;
      }
      return {
        ...detection,
        crop: this.cropRegion(detection, fullImage, cropperConfig),
      };
    });
  }

  private cropRegion(detection: Detection, fullImage: ImageData, config: CropperConfig): ImageData {
    const box = detection.boundingBox;
    let padX = 0;
    let padY = 0;

    if (config.paddingMode === 'relative') {
      padX = Math.max(4, Math.round(box.width * (config.padding / 100)));
      padY = Math.max(4, Math.round(box.height * (config.padding / 100)));
    } else {
      padX = Math.max(0, config.padding);
      padY = Math.max(0, config.padding);
    }

    const imageWidth = fullImage.width;
    const imageHeight = fullImage.height;

    const x = Math.max(0, Math.floor(box.x - padX));
    const y = Math.max(0, Math.floor(box.y - padY));

    const right = Math.min(imageWidth, Math.ceil(box.x + box.width + padX));
    const bottom = Math.min(imageHeight, Math.ceil(box.y + box.height + padY));

    const cropWidth = Math.max(1, right - x);
    const cropHeight = Math.max(1, bottom - y);

    const cropData = new Uint8ClampedArray(cropWidth * cropHeight * 4);
    const srcData = fullImage.data;
    const rowByteLength = cropWidth * 4;

    for (let row = 0; row < cropHeight; row++) {
      const srcOffset = ((y + row) * imageWidth + x) * 4;
      const dstOffset = row * rowByteLength;
      cropData.set(srcData.subarray(srcOffset, srcOffset + rowByteLength), dstOffset);
    }

    if (typeof ImageData !== 'undefined') {
      return new ImageData(cropData, cropWidth, cropHeight);
    }
    return {
      width: cropWidth,
      height: cropHeight,
      data: cropData,
      colorSpace: 'srgb',
    } as unknown as ImageData;
  }
}
