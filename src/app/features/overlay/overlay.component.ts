import { Component, ElementRef, effect, inject, input, viewChild } from '@angular/core';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { BoundingBoxRendererService } from '../../services/visualization/boundingbox-renderer.service';
import { I18nService } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-overlay',
  standalone: true,
  templateUrl: './overlay.component.html',
  styleUrl: './overlay.component.css',
})
export class OverlayComponent {
  readonly width = input.required<number>();
  readonly height = input.required<number>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');
  private readonly i18n = inject(I18nService);

  constructor(
    private readonly pipeline: PipelineService,
    private readonly renderer: BoundingBoxRendererService,
  ) {
    effect(() => {
      this.i18n.activeLocale();
      const width = this.width();
      const height = this.height();

      const detections = this.pipeline.detections();
      const offers = this.pipeline.offers();
      const groupedLines = this.pipeline.groupedLines();
      const showBoundingBoxes = this.pipeline.debugSettings().boundingBoxes;
      const showLineGrouping = this.pipeline.debugSettings().lineGrouping;

      const canvas = this.canvas().nativeElement;

      if (canvas.width !== width) {
        canvas.width = width;
      }
      if (canvas.height !== height) {
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, width, height);

      if (showBoundingBoxes) {
        this.renderer.render(ctx, detections, offers);
      }

      if (showLineGrouping) {
        this.renderer.renderLineGroupings(ctx, groupedLines);
      }
    });
  }
}
