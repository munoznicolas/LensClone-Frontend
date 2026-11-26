# Lens Feature Component

The `Lens` feature manages the main live camera viewport, captures video frame images, drives the vision pipeline detection loop, and renders user interface controls.

## Primary Files
- [lens.component.ts](file:///d:/Repositories/PoC-LensClone/src/app/features/lens/lens.component.ts) - Camera synchronization, frame capture scheduling, torch toggling, and capture history integration.
- [lens.component.html](file:///d:/Repositories/PoC-LensClone/src/app/features/lens/lens.component.html) - Video viewport markup, floating overlay layer (`<app-overlay>`), top action bar, overflow menu, and scan history controls.
- [lens.component.css](file:///d:/Repositories/PoC-LensClone/src/app/features/lens/lens.component.css) - Styling rules for full-screen camera alignment, glassmorphism UI overlays, control panels, and drawer animations.

## Implementation Details
- **Frame Capture**: Reads raw pixel frames from the `<video>` element using an offscreen canvas configured with `{ willReadFrequently: true }`.
- **Loop Guarding**: Scheduled via `requestAnimationFrame` and protected by `detectionInProgress` flag to prevent frame stacking and main-thread lag.
- **Service Integration**:
  - `CameraService`: Starts/stops WebRTC video stream and controls flashlight (torch).
  - `PipelineService`: Receives captured `ImageData` frames for processing.
  - `HistoryService`: Saves snapshot captures with detection counts and text snippets.
  - `AuthService`: Displays user profile state and authentication actions.
  - `I18nService`: Localizes UI labels, action chip toasts, Google Translate target language, TTS voice language, and capture timestamps.
