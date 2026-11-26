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
  render(ctx: CanvasRenderingContext2D, detections: Detection[], offers: ProductOffer[] = []): void {
    ctx.save();
    ctx.font = '14px Arial';
    ctx.textBaseline = 'top';

    // Set of detection IDs already rendered inside complete offer boxes
    const handledDetections = new Set<Detection>();

    // 1. Render Product Offers with visual distinction (Solid for complete, Dashed for partial)
    for (const offer of offers) {
      const isComplete = isOfferComplete(offer);
      const box = offer.boundingBox;

      if (isComplete) {
        // Solid primary outline for complete groups
        ctx.strokeStyle = '#00ff66';
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

        ctx.fillStyle = 'rgba(0, 40, 20, 0.85)';
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        ctx.strokeStyle = '#00ff66';
        ctx.lineWidth = 1;
        ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);

        ctx.fillStyle = '#00ff66';
        ctx.fillText(titleText, labelX + padding, labelY + 3);

        // Render Real-Time Price Comparison Rating Badge
        this.renderPriceRatingBadge(ctx, box, offer.priceRating);
      } else {
        // Dim dashed outline for incomplete/partial offer groups
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }
    }

    // 2. Render remaining standalone detections with dim dashed outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
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

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText(text, labelX + padding, labelY + 2);
      }
    }

    ctx.restore();
  }

  private renderPriceRatingBadge(ctx: CanvasRenderingContext2D, box: { x: number; y: number; width: number; height: number }, rating?: number): void {
    let badgeText = this.i18n.t('overlay.rating.new');
    let bgColor = 'rgba(0, 102, 204, 0.9)';
    let textColor = '#ffffff';

    if (rating === PriceRating.BelowAverage) {
      badgeText = this.i18n.t('overlay.rating.belowAverage');
      bgColor = 'rgba(0, 180, 80, 0.95)';
    } else if (rating === PriceRating.Average) {
      badgeText = this.i18n.t('overlay.rating.average');
      bgColor = 'rgba(120, 130, 140, 0.95)';
    } else if (rating === PriceRating.AboveAverage) {
      badgeText = this.i18n.t('overlay.rating.aboveAverage');
      bgColor = 'rgba(220, 50, 50, 0.95)';
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
    ctx.save();
    ctx.lineWidth = 2;
    ctx.font = 'bold 13px Arial';
    ctx.textBaseline = 'top';

    for (const line of groupedLines) {
      const box = line.boundingBox;

      ctx.strokeStyle = '#00d2ff';
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

      ctx.fillStyle = '#00d2ff';
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

      ctx.fillStyle = '#000000';
      ctx.fillText(tagText, labelX + padding, labelY + 3);
    }

    ctx.restore();
  }
}
