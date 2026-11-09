# Debug Feature Component

The `Debug` feature provides UI controls and diagnostics panels to visualize intermediate computer vision pipeline outputs, inspect stage execution performance metrics, render cropped OCR text regions, and run profiling sessions with change validation guardrails.

## Primary Files
- [debug.component.ts](file:///d:/Repositories/PoC-LensClone/src/app/features/debug/debug.component.ts) - Diagnostic panel component, performance metrics display, option toggles, and profiling session runner.
- [debug.component.html](file:///d:/Repositories/PoC-LensClone/src/app/features/debug/debug.component.html) - Template setup for telemetry metrics, live preview, inspection drawer, profiler waterfall, and micro-benchmarks.
- [debug.component.css](file:///d:/Repositories/PoC-LensClone/src/app/features/debug/debug.component.css) - Glassmorphic styling rules for the diagnostics panel, waterfall latency bars, and validation tables.
- [crop-canvas.component.ts](file:///d:/Repositories/PoC-LensClone/src/app/features/debug/crop-canvas.component.ts) - Standalone child component for rendering individual cropped text regions onto dynamic-sized HTML5 canvases.
- [debug-settings.ts](file:///d:/Repositories/PoC-LensClone/src/app/features/debug/debug-settings.ts) - Interface definition specifying active debug overlay stage flags (`croppedRegions`, `boundingBoxes`, `recognizedText`, `canonicalText`, `lineGrouping`).

## Key Capabilities
- **Intermediate Crop Rendering**: Monitors `PipelineService.state()` via Angular `effect` and draws raw cropped text regions onto individual `<app-crop-canvas>` elements.
- **Stage Metrics & FPS**: Displays real-time inference time breakdowns (DBNet Detection, Bounding Box Filtering, Tracking, Cropping, CRNN Recognition, Line Grouping) and frames per second.
- **Profiler & Validation Studio**:
  - Run multi-iteration profiling sessions (5, 10, 20, 50 passes) with warmup passes.
  - Interactive waterfall charts and percentile tables (Mean, Median p50, p95, Min/Max, StdDev, % Pipeline).
  - Automated change validation guardrails comparing current run against the golden reference baseline.
  - Save current run as new baseline or export full JSON report.
- **Isolated Algorithm Micro-benchmarks**:
  - Benchmarks Weighted Levenshtein, DBNet Postprocessor/Contour tracing, CTC Decoder, Line Grouping, and Tensor Buffer Pool in complete isolation with ops/sec throughput.
- **Interactive Toggles**: Toggles directly mutate the `PipelineService.debugSettings` signal to immediately affect canvas overlays.
