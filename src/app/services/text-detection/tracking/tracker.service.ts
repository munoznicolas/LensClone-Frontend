import { Injectable } from '@angular/core';
import { BoundingBox, Detection, Quantity, LineGrouping } from '../types';
import { PipelineStage, PipelineState } from '../../pipeline/pipeline-state';
import { DEFAULT_PIPELINE_CONFIG, TrackingConfig } from '../../pipeline/pipeline-config.types';

import { hasAllThreeProperties } from '../detection-helper/detection-helpers';

export interface TrackedBox {
  id: string;
  box: BoundingBox;
  boundingBoxScore: number;
  rawText?: string;
  rawTextScore?: number;
  canonicalText?: string;
  price?: string;
  quantity?: Quantity;
  line?: LineGrouping;
  hits: number;
  misses: number;
  age: number;
  lastSeenFrame: number;
  lastRefreshedFrame: number;
}

export function calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  const x1 = Math.max(boxA.x, boxB.x);
  const y1 = Math.max(boxA.y, boxB.y);
  const x2 = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const y2 = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  const intersectionWidth = Math.max(0, x2 - x1);
  const intersectionHeight = Math.max(0, y2 - y1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  if (intersectionArea <= 0) {
    return 0;
  }

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

@Injectable({
  providedIn: 'root',
})
export class TrackerService implements PipelineStage {
  readonly name = 'tracker';

  private readonly activeTracks = new Map<string, TrackedBox>();
  private readonly previousFrameDetections = new Map<string, Detection>();
  private trackCounter = 0;
  private frameCount = 0;

  execute(state: PipelineState): void {
    const config: TrackingConfig =
      state.config?.tracking ?? DEFAULT_PIPELINE_CONFIG.tracking;

    if (!config.enabled) {
      return;
    }

    this.frameCount++;
    this.syncPreviousFrameResults();

    const incomingDetections = state.detections;
    const matchedTrackIds = new Set<string>();
    const matchedDetectionIndices = new Set<number>();

    // Build candidate matches with IoU >= iouThreshold
    interface MatchCandidate {
      trackId: string;
      detectionIndex: number;
      iou: number;
    }

    const candidates: MatchCandidate[] = [];

    incomingDetections.forEach((det, detIdx) => {
      this.activeTracks.forEach((track, trackId) => {
        const iou = calculateIoU(det.boundingBox, track.box);
        if (iou >= config.iouThreshold) {
          candidates.push({ trackId, detectionIndex: detIdx, iou });
        }
      });
    });

    // Greedy matching sorted by highest IoU first
    candidates.sort((a, b) => b.iou - a.iou);

    const updatedDetections: Detection[] = [];

    for (const candidate of candidates) {
      if (
        matchedTrackIds.has(candidate.trackId) ||
        matchedDetectionIndices.has(candidate.detectionIndex)
      ) {
        continue;
      }

      matchedTrackIds.add(candidate.trackId);
      matchedDetectionIndices.add(candidate.detectionIndex);

      const track = this.activeTracks.get(candidate.trackId)!;
      const det = incomingDetections[candidate.detectionIndex];

      // Exponential Moving Average (EMA) box smoothing
      const alpha = Math.max(0, Math.min(1, config.smoothingFactor));
      const smoothedBox: BoundingBox = {
        x: Math.round(alpha * det.boundingBox.x + (1 - alpha) * track.box.x),
        y: Math.round(alpha * det.boundingBox.y + (1 - alpha) * track.box.y),
        width: Math.round(alpha * det.boundingBox.width + (1 - alpha) * track.box.width),
        height: Math.round(alpha * det.boundingBox.height + (1 - alpha) * track.box.height),
      };

      track.box = smoothedBox;
      track.hits++;
      track.age++;
      track.misses = 0;

      const trackAsDet: Detection = {
        boundingBoxScore: track.boundingBoxScore,
        boundingBox: track.box,
        rawText: track.rawText,
        rawTextScore: track.rawTextScore,
        canonicalText: track.canonicalText,
        price: track.price,
        quantity: track.quantity,
        line: track.line,
      };

      const isHighConfidence =
        (track.rawTextScore ?? 0) >= 0.85 &&
        track.rawText !== undefined &&
        track.rawText.trim().length > 0;
      const isComplete = hasAllThreeProperties([trackAsDet]);
      const isFullySatisfied = isHighConfidence || isComplete;

      const framesSinceLastRefresh = this.frameCount - track.lastRefreshedFrame;
      const needsRefresh = !isFullySatisfied || framesSinceLastRefresh >= config.refreshIntervalFrames;

      if (needsRefresh) {
        track.lastRefreshedFrame = this.frameCount;
      }
      track.lastSeenFrame = this.frameCount;

      const isReused = isFullySatisfied && !needsRefresh;

      const updatedDet: Detection = {
        ...det,
        boundingBox: smoothedBox,
        trackId: track.id,
        isReused,
        needsRefresh,
        rawText: isReused ? track.rawText : det.rawText,
        rawTextScore: isReused ? track.rawTextScore : det.rawTextScore,
        canonicalText: isReused ? track.canonicalText : det.canonicalText,
        price: isReused ? track.price : det.price,
        quantity: isReused ? track.quantity : det.quantity,
        line: isReused ? track.line : det.line,
      };

      updatedDetections.push(updatedDet);
    }

    // Process new unmatched incoming detections
    incomingDetections.forEach((det, detIdx) => {
      if (matchedDetectionIndices.has(detIdx)) {
        return;
      }

      const newId = `track_${++this.trackCounter}`;
      const newTrack: TrackedBox = {
        id: newId,
        box: det.boundingBox,
        boundingBoxScore: det.boundingBoxScore,
        rawText: det.rawText,
        rawTextScore: det.rawTextScore,
        canonicalText: det.canonicalText,
        price: det.price,
        quantity: det.quantity,
        line: det.line,
        hits: 1,
        misses: 0,
        age: 1,
        lastSeenFrame: this.frameCount,
        lastRefreshedFrame: this.frameCount,
      };

      this.activeTracks.set(newId, newTrack);
      matchedTrackIds.add(newId);

      updatedDetections.push({
        ...det,
        trackId: newId,
        isReused: false,
        needsRefresh: false,
      });
    });

    // Handle unmatched active tracks (missed detections in current frame)
    this.activeTracks.forEach((track, trackId) => {
      if (matchedTrackIds.has(trackId)) {
        return;
      }

      track.misses++;
      track.age++;

      if (track.misses <= config.maxMisses) {
        // Maintain persistent track box for drop tolerance
        updatedDetections.push({
          boundingBoxScore: track.boundingBoxScore,
          boundingBox: track.box,
          trackId: track.id,
          isReused: true,
          isExtrapolated: true,
          needsRefresh: false,
          rawText: track.rawText,
          rawTextScore: track.rawTextScore,
          canonicalText: track.canonicalText,
          price: track.price,
          quantity: track.quantity,
          line: track.line,
        });
      } else {
        // Track expired
        this.activeTracks.delete(trackId);
        this.previousFrameDetections.delete(trackId);
      }
    });

    state.detections = updatedDetections;

    // Cache updated detections for synchronization on next frame
    this.previousFrameDetections.clear();
    for (const det of updatedDetections) {
      if (det.trackId) {
        this.previousFrameDetections.set(det.trackId, det);
      }
    }
  }

  reset(): void {
    this.activeTracks.clear();
    this.previousFrameDetections.clear();
    this.trackCounter = 0;
    this.frameCount = 0;
  }

  private syncPreviousFrameResults(): void {
    this.previousFrameDetections.forEach((prevDet, trackId) => {
      const track = this.activeTracks.get(trackId);
      if (!track) {
        return;
      }

      const prevScore = prevDet.rawTextScore ?? 0;
      const currentScore = track.rawTextScore ?? 0;

      const hasAnyField = Boolean(
        prevDet.rawText ||
        prevDet.canonicalText ||
        prevDet.price ||
        prevDet.quantity,
      );

      const shouldUpdateRecognition =
        hasAnyField &&
        (!track.rawText ||
          prevScore >= currentScore ||
          currentScore < 0.85);

      if (shouldUpdateRecognition) {
        if (prevDet.rawText !== undefined) track.rawText = prevDet.rawText;
        if (prevDet.rawTextScore !== undefined) track.rawTextScore = prevDet.rawTextScore;
        if (prevDet.canonicalText !== undefined) track.canonicalText = prevDet.canonicalText;
        if (prevDet.price !== undefined) track.price = prevDet.price;
        if (prevDet.quantity !== undefined) track.quantity = prevDet.quantity;
      }

      if (prevDet.line !== undefined) {
        track.line = prevDet.line;
      }
    });
  }
}
