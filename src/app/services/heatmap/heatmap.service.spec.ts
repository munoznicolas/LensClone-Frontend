import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeatmapService } from './heatmap.service';
import { ShoppingListItem } from '../shopping-list/shopping-list.service';
import { SettingsService } from '../settings/settings.service';

describe('HeatmapService', () => {
  let service: HeatmapService;
  let httpMock: HttpTestingController;
  let backendApiUrl: ReturnType<typeof signal<string>>;

  beforeEach(() => {
    backendApiUrl = signal('https://api.example.com/api/v1/prices/');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SettingsService,
          useValue: {
            backendApiUrl: backendApiUrl.asReadonly(),
            radiusKm: signal(10).asReadonly(),
          },
        },
      ],
    });
    service = TestBed.inject(HeatmapService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should start with empty stores and empty product catalog', () => {
    expect(service).toBeTruthy();
    expect(service.stores()).toEqual([]);
    expect(service.productCatalog()).toEqual([]);
  });

  it('should fetch stores from /api/v1/stores/heatmap and handle empty or error responses', () => {
    service.fetchSpatialHeatmap(-34.5, -58.5, 12);
    expect(service.isLoading()).toBe(true);

    const req = httpMock.expectOne(
      'https://api.example.com/api/v1/stores/heatmap?lat=-34.5&lon=-58.5&radiusKm=12',
    );
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        storeId: 's1',
        storeName: 'Store One',
        chain: 'Local',
        address: '123 Main St',
        lat: -34.51,
        lng: -58.51,
        estimatedBasketTotal: 0,
        averageItemPrice: 0,
        savingsPercentage: 10,
        priceIndexScore: 0.2,
        status: 'best',
        itemCount: 0,
      },
      {
        storeId: 's2',
        storeName: 'Store Two',
        chain: 'Local',
        address: '456 Oak St',
        lat: -34.52,
        lng: -58.52,
        estimatedBasketTotal: 0,
        averageItemPrice: 0,
        savingsPercentage: -10,
        priceIndexScore: 0.8,
        status: 'expensive',
        itemCount: 0,
      },
    ]);

    expect(service.isLoading()).toBe(false);
    expect(service.loadError()).toBe(false);
    expect(service.stores()).toHaveLength(2);

    const sampleItems: ShoppingListItem[] = [
      { id: '1', name: 'Milk', quantity: 2, estimatedUnitPrice: 0, manualUnitPrice: 10 },
    ];
    const summaries = service.calculateStoreSummaries(sampleItems);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].storeId).toBe('s1');
    expect(summaries[0].estimatedBasketTotal).toBe(18);
    expect(summaries[1].estimatedBasketTotal).toBe(22);

    // Empty response clears stores
    service.fetchSpatialHeatmap(-34.5, -58.5, 5);
    const emptyReq = httpMock.expectOne(
      'https://api.example.com/api/v1/stores/heatmap?lat=-34.5&lon=-58.5&radiusKm=5',
    );
    emptyReq.flush([]);
    expect(service.stores()).toEqual([]);

    // Error response sets loadError and clears stores
    service.fetchSpatialHeatmap(-34.5, -58.5, 5);
    const errReq = httpMock.expectOne(
      'https://api.example.com/api/v1/stores/heatmap?lat=-34.5&lon=-58.5&radiusKm=5',
    );
    errReq.flush('Server Error', { status: 500, statusText: 'Server Error' });
    expect(service.loadError()).toBe(true);
    expect(service.stores()).toEqual([]);
  });
});
