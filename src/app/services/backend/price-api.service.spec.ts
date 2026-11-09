import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PriceApiService, PriceRating } from './price-api.service';
import { HttpClient } from '@angular/common/http';
import { SettingsService } from '../settings/settings.service';
import { IndexedDbService } from '../storage/indexed-db.service';
import { AuthService } from '../auth/auth.service';
import { GpsCoordinates, ProductOffer } from '../text-detection/types';
import { TestBed } from '@angular/core/testing';
import { of, firstValueFrom } from 'rxjs';
import { signal } from '@angular/core';

describe('PriceApiService', () => {
  let service: PriceApiService;
  let httpMock: any;
  let settingsMock: any;
  let idbMock: any;
  let authMock: any;

  const mockCoords: GpsCoordinates = {
    latitude: -34.5,
    longitude: -58.4,
    isApproximate: false,
  };

  beforeEach(() => {
    httpMock = {
      post: vi.fn(),
    };

    settingsMock = {
      backendApiUrl: signal('http://localhost:5000/api/v1/prices'),
      timeWindowDays: signal(14),
      radiusKm: signal(10),
      tolerancePercent: signal(5),
    };

    idbMock = {
      put: vi.fn().mockResolvedValue('ok'),
      getAll: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const isAuthSignal = signal(false);
    const userSignal = signal<any>(null);

    authMock = {
      isAuthenticated: isAuthSignal,
      currentUser: userSignal,
    };

    TestBed.configureTestingModule({
      providers: [
        PriceApiService,
        { provide: HttpClient, useValue: httpMock },
        { provide: SettingsService, useValue: settingsMock },
        { provide: IndexedDbService, useValue: idbMock },
        { provide: AuthService, useValue: authMock },
      ],
    });

    service = TestBed.inject(PriceApiService);
  });

  it('should allow comparePrice for guest users without authentication', async () => {
    const mockResponse = {
      productName: 'YERBA MATE',
      currentPrice: 2400,
      averagePrice: 2400,
      minPrice: 2400,
      maxPrice: 2400,
      sampleCount: 1,
      rating: PriceRating.Average,
      radiusKm: 10,
      timeWindowDays: 14,
      tolerancePercent: 5,
    };
    httpMock.post.mockReturnValue(of(mockResponse));

    const result = await firstValueFrom(
      service.comparePrice('YERBA MATE', 2400, mockCoords)
    );

    expect(result).toEqual(mockResponse);
    expect(httpMock.post).toHaveBeenCalledWith(
      'http://localhost:5000/api/v1/prices/compare',
      expect.objectContaining({
        productName: 'YERBA MATE',
        price: 2400,
      })
    );
  });

  it('should reject submitPrice for guest (unauthenticated) users and avoid HTTP call', async () => {
    const offer: ProductOffer = {
      id: 'off-1',
      product: 'LECHE 1L',
      price: '$1200',
      boundingBox: { x: 0, y: 0, width: 100, height: 50 },
      confidence: 0.95,
      detections: [],
    };

    const result = await firstValueFrom(
      service.submitPrice(offer, mockCoords)
    );

    expect(result).toBeNull();
    expect(httpMock.post).not.toHaveBeenCalled();
  });

  it('should allow submitPrice when user is logged in with Google', async () => {
    authMock.isAuthenticated.set(true);
    authMock.currentUser.set({
      id: 'google_user_777',
      name: 'Alex Rivera',
      email: 'alex@gmail.com',
    });

    const mockResponse = {
      success: true,
      message: 'Recorded',
      submissionId: 'sub_123',
    };
    httpMock.post.mockReturnValue(of(mockResponse));

    const offer: ProductOffer = {
      id: 'off-2',
      product: 'TOMATE 1KG',
      price: '$1800',
      quantity: { quantity: 1, unit: 'kg' },
      boundingBox: { x: 0, y: 0, width: 100, height: 50 },
      confidence: 0.98,
      detections: [],
    };

    const result = await firstValueFrom(
      service.submitPrice(offer, mockCoords)
    );

    expect(result).toEqual(mockResponse);
    expect(httpMock.post).toHaveBeenCalledWith(
      'http://localhost:5000/api/v1/prices/submit',
      expect.objectContaining({
        productName: 'TOMATE 1KG',
        price: 1800,
        deviceId: 'usr_google_user_777',
      })
    );
  });
});
