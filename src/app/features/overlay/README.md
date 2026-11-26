# Overlay Feature Component

The `Overlay` feature renders real-time visual bounding boxes, OCR text badges, and line grouping overlays on top of the live video feed.

## Primary Files
- [overlay.component.ts](file:///d:/Repositories/PoC-LensClone/src/app/features/overlay/overlay.component.ts) - Resizes overlay canvas dynamically and delegates box rendering to `BoundingBoxRendererService`.
- [overlay.component.html](file:///d:/Repositories/PoC-LensClone/src/app/features/overlay/overlay.component.html) - Transparent canvas overlay container aligned over the video stream.
- [overlay.component.css](file:///d:/Repositories/PoC-LensClone/src/app/features/overlay/overlay.component.css) - Position rules for absolute alignment over the camera viewport.

## Overlay Rendering
- An Angular `effect` automatically triggers when `width`, `height`, `PipelineService.state`, or `I18nService.activeLocale` changes.
- **Bounding Boxes**: When `debugSettings.boundingBoxes` is active, draws green bounding rectangles and recognized text/price labels.
- **Line Groupings**: When `debugSettings.lineGrouping` is active, calls `renderLineGroupings` on `BoundingBoxRendererService` to render cyan dashed bounding boxes for grouped text lines.
