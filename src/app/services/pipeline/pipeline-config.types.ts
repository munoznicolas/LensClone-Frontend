export interface DetectorConfig {
  thresholdValue: number;
  minArea: number;
  minAspectRatio: number;
  maxSide?: number;
  scaleFactor?: number;
  intervalFrames?: number;
}

export interface CropperConfig {
  padding: number;
  paddingMode: 'fixed' | 'relative';
}

export interface RecognizerConfig {
  targetHeight: number;
}

export interface LineGroupingConfig {
  maxScore: number;
  weights: {
    vertical: number;
    height: number;
    horizontal: number;
    confidence: number;
  };
  limits: {
    maxVertical: number;
    maxHeightRatio: number;
  };
}

export interface DictionaryConfig {
  similarityThreshold: number;
  priceMin: number;
  priceMax: number;
}

export interface TrackingConfig {
  enabled: boolean;
  iouThreshold: number;
  maxMisses: number;
  smoothingFactor: number;
  refreshIntervalFrames: number;
}

export interface PipelineConfig {
  detector: DetectorConfig;
  cropper: CropperConfig;
  recognizer: RecognizerConfig;
  lineGrouping: LineGroupingConfig;
  dictionary: DictionaryConfig;
  tracking: TrackingConfig;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  detector: {
    thresholdValue: 0.2,
    minArea: 10,
    minAspectRatio: 1.4,
    maxSide: 0,
    scaleFactor: 0.5,
    intervalFrames: 1,
  },
  cropper: {
    padding: 6,
    paddingMode: 'fixed',
  },
  recognizer: {
    targetHeight: 48,
  },
  lineGrouping: {
    maxScore: 0.8,
    weights: {
      vertical: 0.3,
      height: 0.25,
      horizontal: 0.1,
      confidence: 0.05,
    },
    limits: {
      maxVertical: 1.0,
      maxHeightRatio: 2.0,
    },
  },
  dictionary: {
    similarityThreshold: 0.65,
    priceMin: 1000,
    priceMax: 9999,
  },
  tracking: {
    enabled: true,
    iouThreshold: 0.3,
    maxMisses: 3,
    smoothingFactor: 0.6,
    refreshIntervalFrames: 30,
  },
};
