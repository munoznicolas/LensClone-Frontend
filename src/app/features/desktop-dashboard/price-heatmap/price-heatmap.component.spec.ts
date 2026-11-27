import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceHeatmapComponent } from './price-heatmap.component';
import { LocationService } from '../../../services/location/location.service';
import { GpsCoordinates } from '../../../services/text-detection/types';

describe('PriceHeatmapComponent', () => {
  let component: PriceHeatmapComponent;
  let fixture: ComponentFixture<PriceHeatmapComponent>;
  let httpMock: HttpTestingController;
  let coordsSignal: ReturnType<typeof signal<GpsCoordinates | null>>;

  beforeEach(async () => {
    coordsSignal = signal<GpsCoordinates | null>(null);

    await TestBed.configureTestingModule({
      imports: [PriceHeatmapComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: LocationService,
          useValue: {
            coordinates: coordsSignal.asReadonly(),
            isTracking: signal(false).asReadonly(),
            permissionStatus: signal<PermissionState | 'unknown'>('prompt').asReadonly(),
            startTracking: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PriceHeatmapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    httpMock.verify();
  });

  it('should create in groceryList mode with empty stores and prompt for location', () => {
    expect(component).toBeTruthy();
    expect(component.activeMode()).toBe('groceryList');
    expect(component.bestStore()).toBeNull();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.enable-location-btn')).not.toBeNull();
  });

  it('should switch heatmap modes safely when catalog is empty', () => {
    component.setMode('productFilter');
    fixture.detectChanges();
    expect(component.activeMode()).toBe('productFilter');
    expect(component.storeSummaries()).toEqual([]);

    component.setMode('categoryFilter');
    fixture.detectChanges();
    expect(component.activeMode()).toBe('categoryFilter');
    expect(component.storeSummaries()).toEqual([]);
  });

  it('should fetch stores when GPS coordinates become available and compute bestStore', () => {
    coordsSignal.set({
      latitude: -34.5,
      longitude: -58.5,
      isApproximate: true,
      accuracyMode: 'approximate',
    });
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/stores/heatmap'));
    req.flush([
      {
        storeId: 's1',
        storeName: 'Live Store',
        chain: 'Local',
        address: '100 Real Ave',
        lat: -34.501,
        lng: -58.501,
        estimatedBasketTotal: 0,
        averageItemPrice: 0,
        savingsPercentage: 12,
        priceIndexScore: 0.1,
        status: 'best',
        itemCount: 0,
      },
    ]);
    fixture.detectChanges();

    const best = component.bestStore();
    expect(best).toBeTruthy();
    expect(best?.storeName).toBe('Live Store');
    expect(best?.status).toBe('best');
  });
});
