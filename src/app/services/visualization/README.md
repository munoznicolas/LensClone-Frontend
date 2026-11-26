# Visualization Service

The `BoundingBoxRendererService` handles high-performance 2D canvas drawing operations to render detected text bounding boxes, labels, prices, and line grouping overlays.

## Primary Files
- [boundingbox-renderer.service.ts](file:///d:/Repositories/PoC-LensClone/src/app/services/visualization/boundingbox-renderer.service.ts) - Service responsible for rendering detections and grouped lines onto HTML5 canvas contexts.
- [types.ts](file:///d:/Repositories/PoC-LensClone/src/app/services/visualization/types.ts) - Type definitions for visualizer overlay options.

## Key Methods
- `render(ctx: CanvasRenderingContext2D, detections: Detection[])`: Renders green bounding box outlines and text labels (canonical text or price tag) over detected regions.
- `renderLineGroupings(ctx: CanvasRenderingContext2D, groupedLines: GroupedTextLine[])`: Renders cyan dashed box outlines around combined line groupings with line ID badges.

## Usage Context
Used by overlay canvas components (`OverlayComponent`) and debug diagnostic views (`DebugComponent`) to render real-time computer vision bounding boxes. Price rating badges and line grouping labels are localized via `I18nService`.
