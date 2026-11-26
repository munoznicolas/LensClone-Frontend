import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BoundingBoxRendererService } from './boundingbox-renderer.service';
import { Detection, ProductOffer } from '../text-detection/types';
import { PriceRating } from '../backend/price-api.service';
import { I18nService } from '../i18n/i18n.service';

describe('BoundingBoxRendererService', () => {
  let service: BoundingBoxRendererService;
  let i18n: I18nService;

  beforeEach(() => {
    const localStore = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) => localStore.set(key, value),
      removeItem: (key: string) => localStore.delete(key),
      clear: () => localStore.clear(),
      length: 0,
      key: () => null,
    });
    TestBed.configureTestingModule({
      providers: [BoundingBoxRendererService],
    });
    service = TestBed.inject(BoundingBoxRendererService);
    i18n = TestBed.inject(I18nService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should render bounding box and label for detections with canonicalText', () => {
    const mockContext = {
      save: vi.fn(),
      restore: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      lineWidth: 0,
      strokeStyle: '',
      font: '',
      textBaseline: '',
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    const detections: Detection[] = [
      {
        boundingBoxScore: 0.9,
        boundingBox: { x: 10, y: 20, width: 60, height: 30 },
        canonicalText: 'CEBOLLA',
      },
      {
        boundingBoxScore: 0.8,
        boundingBox: { x: 100, y: 100, width: 50, height: 20 },
        // No canonicalText, should be skipped
      },
    ];

    service.render(mockContext, detections);

    expect(mockContext.save).toHaveBeenCalled();
    expect(mockContext.strokeRect).toHaveBeenCalledWith(10, 20, 60, 30);
    expect(mockContext.fillText).toHaveBeenCalledWith('CEBOLLA', expect.any(Number), expect.any(Number));
    expect(mockContext.restore).toHaveBeenCalled();
  });

  it('should render line grouping bounding box and label when renderLineGroupings is called', () => {
    const mockContext = {
      save: vi.fn(),
      restore: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 60 }),
      lineWidth: 0,
      strokeStyle: '',
      font: '',
      textBaseline: '',
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    const groupedLines = [
      {
        lineId: 0,
        score: 0.1,
        combinedText: 'OFERTA ALMACEN',
        boundingBox: { x: 15, y: 25, width: 120, height: 35 },
        detections: [],
      },
    ];

    service.renderLineGroupings(mockContext, groupedLines);

    expect(mockContext.save).toHaveBeenCalled();
    expect(mockContext.strokeRect).toHaveBeenCalledWith(15, 25, 120, 35);
    expect(mockContext.fillText).toHaveBeenCalledWith('Line #0 (0)', expect.any(Number), expect.any(Number));
    expect(mockContext.restore).toHaveBeenCalled();
  });

  it('should render Spanish (es-AR) price rating badges and line grouping labels when active locale is es-AR', () => {
    const mockContext = {
      save: vi.fn(),
      restore: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 60 }),
      lineWidth: 0,
      strokeStyle: '',
      font: '',
      textBaseline: '',
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    i18n.setPreference('es-AR');

    const offers: ProductOffer[] = [
      {
        id: 'off-1',
        product: 'LECHE 1L',
        price: '$1500',
        quantity: { quantity: 1, unit: 'kg' },
        boundingBox: { x: 10, y: 30, width: 100, height: 40 },
        confidence: 0.95,
        detections: [],
        priceRating: PriceRating.BelowAverage,
      },
      {
        id: 'off-2',
        product: 'PAN 1KG',
        price: '$2200',
        quantity: { quantity: 1, unit: 'kg' },
        boundingBox: { x: 10, y: 90, width: 100, height: 40 },
        confidence: 0.95,
        detections: [],
        priceRating: PriceRating.Average,
      },
      {
        id: 'off-3',
        product: 'CAFE',
        price: '$4500',
        quantity: { quantity: 1, unit: 'kg' },
        boundingBox: { x: 10, y: 150, width: 100, height: 40 },
        confidence: 0.95,
        detections: [],
        priceRating: PriceRating.AboveAverage,
      },
      {
        id: 'off-4',
        product: 'YERBA',
        price: '$3200',
        quantity: { quantity: 1, unit: 'kg' },
        boundingBox: { x: 10, y: 210, width: 100, height: 40 },
        confidence: 0.95,
        detections: [],
      },
    ];

    service.render(mockContext, [], offers);

    expect(mockContext.fillText).toHaveBeenCalledWith(
      '🟢 Bajo el promedio',
      expect.any(Number),
      expect.any(Number),
    );
    expect(mockContext.fillText).toHaveBeenCalledWith(
      '⚪ Precio promedio',
      expect.any(Number),
      expect.any(Number),
    );
    expect(mockContext.fillText).toHaveBeenCalledWith(
      '🔴 Sobre el promedio',
      expect.any(Number),
      expect.any(Number),
    );
    expect(mockContext.fillText).toHaveBeenCalledWith(
      '🔵 Nuevo registro',
      expect.any(Number),
      expect.any(Number),
    );

    service.renderLineGroupings(mockContext, [
      {
        lineId: 0,
        score: 0.1,
        combinedText: 'OFERTA ALMACEN',
        boundingBox: { x: 15, y: 25, width: 120, height: 35 },
        detections: [],
      },
    ]);

    expect(mockContext.fillText).toHaveBeenCalledWith(
      'Línea #0 (0)',
      expect.any(Number),
      expect.any(Number),
    );
  });
});
