# Text Detection & Recognition Engine

The `text-detection` module provides the specialized computer vision processing blocks used by the main pipeline to detect bounding boxes, extract crops, run OCR character recognition, correct spelling, group text lines, and track targets across frames.

## Sub-Modules & Services

### 1. Object Detection (DBNet Model)
- [detector.service.ts](file:///src/app/services/text-detection/detector/detector.service.ts) - Runs ONNX WASM model inference for DBNet text detection. Supports configurable interleaved frame skipping (`intervalFrames`) to decouple detection frequency from video frame rate.
- [detector-preprocessor.service.ts](file:///src/app/services/text-detection/detector/detector-preprocessor.service.ts) - Resizes input images to DBNet dimensions (e.g. 640x640) and normalizes tensor pixels.
- [detector-postprocessor.service.ts](file:///src/app/services/text-detection/detector/detector-postprocessor.service.ts) - Converts probability maps into bounding polygon contours and rectangles.
- [detector-filter.service.ts](file:///src/app/services/text-detection/detector/detector-filter.service.ts) - Filters out low-confidence candidate bounding boxes.

### 2. Cropping & Image Extraction
- [cropper.service.ts](file:///src/app/services/text-detection/cropper/cropper.service.ts) - Extracts cropped sub-images directly from raw source pixel byte buffers without DOM or OffscreenCanvas overhead.

### 3. Text Recognition (CRNN / OCR Model)
- [recognition.service.ts](file:///src/app/services/text-detection/recognition/recognition.service.ts) - Runs ONNX WASM model inference for CRNN text recognition with multi-crop tensor batching and temporal cache bypass.
- [recognition-preprocessor.service.ts](file:///src/app/services/text-detection/recognition/recognition-preprocessor.service.ts) - Normalizes cropped text region images via direct CPU bilinear interpolation and right-padded batch tensors (`toBatchTensor`).
- [recognition-postprocessor.service.ts](file:///src/app/services/text-detection/recognition/recognition-postprocessor.service.ts) - Handles zero-copy batch CTC decoding (`decodeBatchWithScore`) for output token sequences.
- [recognition-decoder.service.ts](file:///src/app/services/text-detection/recognition/recognition-decoder.service.ts) - Decodes logits to string raw text.

### 4. Dictionary & Post-Processing
- [dictionary-matcher.service.ts](file:///src/app/services/text-detection/dictionary/dictionary-matcher.service.ts) - Performs dictionary matching, spelling correction, price parsing, and quantity parsing.
- [weighted-levenshtein.service.ts](file:///src/app/services/text-detection/dictionary/weighted-levenshtein.service.ts) - Weighted edit distance algorithm tailored for OCR error correction.

### 5. Line Grouping & Offer Structuring
- [line-grouping.service.ts](file:///src/app/services/text-detection/line-grouping/line-grouping.service.ts) - Groups adjacent text bounding boxes into horizontal lines.
- [offer-extractor.service.ts](file:///src/app/services/text-detection/offer-extraction/offer-extractor.service.ts) - Combines product names, quantities, and prices into structured `ProductOffer` objects.

### 6. Performance & Tracking Utilities
- [tracker.service.ts](file:///src/app/services/text-detection/tracking/tracker.service.ts) - Multi-object bounding box tracking across video frames with IoU matching and temporal text caching.
- [tensor-buffer-pool.service.ts](file:///src/app/services/text-detection/tensor-buffer-pool/tensor-buffer-pool.service.ts) - Buffer pool for ONNX tensor allocations to eliminate GC overhead.
- [detection-helpers.ts](file:///src/app/services/text-detection/detection-helper/detection-helpers.ts) - Pure utility functions for geometric bounding box operations.
- [types.ts](file:///src/app/services/text-detection/types.ts) - Core interfaces (`Detection`, `BoundingBox`, `GroupedTextLine`, `ProductOffer`).
