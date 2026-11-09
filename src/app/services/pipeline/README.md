# Vision Processing Pipeline

The `PipelineService` coordinates multi-stage computer vision models and processing blocks to convert raw image pixels into tracked bounding boxes, OCR text, grouped reading lines, and structured product offers.

## Primary Modules & Files
- [pipeline.service.ts](file:///d:/Repositories/PoC-LensClone/src/app/services/pipeline/pipeline.service.ts) - Main pipeline orchestrator service.
- [pipeline.worker.ts](file:///d:/Repositories/PoC-LensClone/src/app/services/pipeline/pipeline.worker.ts) - Web Worker pipeline execution for off-main-thread inference.
- [pipeline-state.ts](file:///d:/Repositories/PoC-LensClone/src/app/services/pipeline/pipeline-state.ts) - Immutably typed pipeline state interfaces and stage metrics.
- [pipeline-config.types.ts](file:///d:/Repositories/PoC-LensClone/src/app/services/pipeline/pipeline-config.types.ts) - Pipeline configuration thresholds and options.
- [profiling/](file:///d:/Repositories/PoC-LensClone/src/app/services/pipeline/profiling/) - High-resolution statistical telemetry, percentiles (p50/p95/p99), and algorithm micro-benchmarks.
- [validation/](file:///d:/Repositories/PoC-LensClone/src/app/services/pipeline/validation/) - Regression guardrails, baseline persistence, and change validation suite.
- [benchmark/](file:///d:/Repositories/PoC-LensClone/src/app/services/pipeline/benchmark/) - Dataset evaluator and grid search parameter matrix.

## Components & Flow Sequence
1. **[DetectorService](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/detector/detector.service.ts)** (DBNet): Detects text region bounding boxes in raw image frames.
2. **[DetectorFilterService](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/detector/detector-filter.service.ts)**: Rejects low-confidence candidate bounding boxes.
3. **[TrackerService](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/tracking/tracker.service.ts)**: Tracks bounding boxes across consecutive video frames to smooth bounding boxes and prevent flickering.
4. **[DetectorCropperService](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/cropper/cropper.service.ts)**: Crops bounding box regions out of the main canvas into smaller sub-images for OCR.
5. **[RecognitionService](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/recognition/recognition.service.ts)** (CRNN/OCR): Recognizes text characters inside cropped region images.
6. **[DictionaryMatcherService](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/dictionary/dictionary-matcher.service.ts)**: Corrects spelling errors against a dictionary corpus and parses price/quantity tokens.
7. **[LineGroupingService](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/line-grouping/line-grouping.service.ts)**: Merges adjacent horizontal text chunks on the same visual line.
8. **[OfferExtractorService](file:///d:/Repositories/PoC-LensClone/src/app/services/text-detection/offer-extraction/offer-extractor.service.ts)**: Assembles product names, prices, and quantities into structured `ProductOffer` objects.

## Profiling & Change Validation Suite
The OCR pipeline includes a comprehensive profiling and change validation suite:

### 1. CLI Profiling & Regression Verification
```bash
# Run isolated micro-benchmarks and display telemetry
npm run profile

# Run validation checks with non-zero exit code if regressions occur
npm run profile:validate

# Record current benchmark snapshot as the golden baseline
npm run profile:baseline
```

### 2. Guardrail Thresholds
- **Detection**: Max allowed F1 drop $\le -0.01$, IoU drop $\le -0.02$.
- **Recognition**: Max allowed CER increase $\le +0.02$, WER $\le +0.03$, ExactMatch drop $\le -0.02$.
- **Performance**: Max allowed latency degradation $\le +5\%$.
- **Memory**: Tensor buffer pool hit rate $\ge 85\%$.

## Key Signals & State Exposed
- `state`: `Signal<PipelineState>` - Read-only reactive state containing active detections, offers, processing metrics, and config.
- `detections`: `Signal<Detection[]>` - Extracted detection items.
- `offers`: `Signal<ProductOffer[]>` - Structured product offer groups.
- `groupedLines`: `Signal<GroupedTextLine[]>` - Computed single-line and multi-line offer reading groups.
- `debugSettings`: `Signal<DebugSettings>` - Configurable flags for overlay canvas visualization stages.
