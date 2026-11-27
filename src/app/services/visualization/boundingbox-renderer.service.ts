import { Injectable, inject } from '@angular/core';
import { Detection, GroupedTextLine, ProductOffer } from '../text-detection/types';
import { isOfferComplete } from '../text-detection/detection-helper/detection-helpers';
import { PriceRating } from '../backend/price-api.service';
import { I18nService } from '../i18n/i18n.service';

@Injectable({
  providedIn: 'root',
})
export class BoundingBoxRendererService {
  private readonly i18n = inject(I18nService);

  private cssVar(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  render(ctx: CanvasRenderingContext2D, detections: Detection[], offers: ProductOffer[] = []): void {
    const hudAccent = this.cssVar('--color-hud-accent', '#4caf50');
    const hudBg = this.cssVar('--color-hud-bg', '#111612');
    const hudText = this.cssVar('--color-hud-text', '#faf6ee');
    const dealColor = this.cssVar('--color-deal', '#d97706');

    ctx.save();
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'top';

    // Set of detection IDs already rendered inside complete offer boxes
    const handledDetections = new Set<Detection>();

    // 1. Render Product Offers with visual distinction (Solid for complete, Dashed for partial)
    for (const offer of offers) {
      const isComplete = isOfferComplete(offer);
      const box = offer.boundingBox;

      if (isComplete) {
        // Solid primary outline for complete groups
        ctx.strokeStyle = hudAccent;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Mark detections inside offer as handled
        offer.detections.forEach((d) => handledDetections.add(d));

        // Render Title Badge above offer box
        const qtyLabel = offer.quantity ? ` (${offer.quantity.quantity} ${offer.quantity.unit})` : '';
        const titleText = `✓ ${offer.product}${qtyLabel} - ${offer.price}`;
        
        const padding = 6;
        const textWidth = ctx.measureText(titleText).width;
        const labelWidth = textWidth + padding * 2;
        const labelHeight = 22;

        const labelX = box.x;
        const labelY = Math.max(0, box.y - labelHeight - 2);

        ctx.fillStyle = hudBg;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        ctx.strokeStyle = hudAccent;
        ctx.lineWidth = 1;
        ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);

        ctx.fillStyle = hudText;
        ctx.fillText(titleText, labelX + padding, labelY + 3);

        // Render Real-Time Price Comparison Rating Badge
        this.renderPriceRatingBadge(ctx, box, offer.priceRating);
      } else {
        // Dim dashed outline for incomplete/partial offer groups
        ctx.strokeStyle = dealColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }
    }

    // 2. Render remaining standalone detections with dim dashed outline
    ctx.strokeStyle = 'rgba(250, 246, 238, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    for (const detection of detections) {
      if (handledDetections.has(detection)) continue;

      const box = detection.boundingBox;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      const text = detection.canonicalText ?? detection.price;
      if (text) {
        const padding = 3;
        const textWidth = ctx.measureText(text).width;
        const labelWidth = textWidth + padding * 2;
        const labelHeight = 18;

        const labelX = box.x;
        const labelY = Math.max(0, box.y - labelHeight);

        ctx.fillStyle = hudBg;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

        ctx.fillStyle = hudText;
        ctx.fillText(text, labelX + padding, labelY + 2);
      }
    }

    ctx.restore();
  }

  private renderPriceRatingBadge(ctx: CanvasRenderingContext2D, box: { x: number; y: number; width: number; height: number }, rating?: number): void {
    let badgeText = this.i18n.t('overlay.rating.new');
    let bgColor = this.cssVar('--color-deal', '#d97706');
    const textColor = this.cssVar('--color-on-brand', '#ffffff');

    if (rating === PriceRating.BelowAverage) {
      badgeText = this.i18n.t('overlay.rating.belowAverage');
      bgColor = this.cssVar('--color-brand', '#2e6f40');
    } else if (rating === PriceRating.Average) {
      badgeText = this.i18n.t('overlay.rating.average');
      bgColor = this.cssVar('--color-text-muted', '#5b665d');
    } else if (rating === PriceRating.AboveAverage) {
      badgeText = this.i18n.t('overlay.rating.aboveAverage');
      bgColor = this.cssVar('--color-danger', '#dc2626');
    }

    const padding = 6;
    const textWidth = ctx.measureText(badgeText).width;
    const badgeWidth = textWidth + padding * 2;
    const badgeHeight = 22;

    const badgeX = box.x + box.width - badgeWidth;
    const badgeY = Math.max(0, box.y - badgeHeight - 2);

    ctx.fillStyle = bgColor;
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    ctx.fillStyle = textColor;
    ctx.fillText(badgeText, badgeX + padding, badgeY + 3);
  }

  renderLineGroupings(ctx: CanvasRenderingContext2D, groupedLines: GroupedTextLine[]): void {
    const hudAccent = this.cssVar('--color-hud-accent', '#4caf50');
    const hudBg = this.cssVar('--color-hud-bg', '#111612');

    ctx.save();
    ctx.lineWidth = 2;
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'top';

    for (const line of groupedLines) {
      const box = line.boundingBox;

      ctx.strokeStyle = hudAccent;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.setLineDash([]);

      const tagText = this.i18n.t('overlay.lineTag', {
        lineId: line.lineId,
        count: line.detections.length,
      });
      const padding = 4;
      const textWidth = ctx.measureText(tagText).width;
      const labelWidth = textWidth + padding * 2;
      const labelHeight = 20;

      const labelX = box.x;
      const labelY = Math.max(0, box.y - labelHeight);

      ctx.fillStyle = hudAccent;
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

      ctx.fillStyle = hudBg;
      ctx.fillText(tagText, labelX + padding, labelY + 3);
    }

    ctx.restore();
  }
}
