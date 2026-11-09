import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LensComponent } from './lens.component';
import { CameraService } from '../../services/camera/camera.service';
import { PipelineService } from '../../services/pipeline/pipeline.service';
import { HistoryService } from '../../services/history/history.service';
import { AuthService } from '../../services/auth/auth.service';
import { PriceApiService } from '../../services/backend/price-api.service';
import { GpsCoordinates, ProductOffer } from '../../services/text-detection/types';
import { computed, signal } from '@angular/core';
import { of } from 'rxjs';

if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

describe('LensComponent', () => {
  let component: LensComponent;
  let fixture: ComponentFixture<LensComponent>;
  let cameraServiceMock: any;
  let pipelineServiceMock: any;
  let historyServiceMock: any;
  let authServiceMock: any;
  let priceApiServiceMock: any;
  let stateSignal: any;
  let userSignal: any;

  const mockCoordinates: GpsCoordinates = {
    latitude: -34.5,
    longitude: -58.4,
    isApproximate: false,
  };

  beforeEach(async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());

    cameraServiceMock = {
      start: vi.fn().mockImplementation((video: HTMLVideoElement) => {
        Object.defineProperty(video, 'readyState', { value: 4, writable: true });
        Object.defineProperty(video, 'videoWidth', { value: 640, writable: true });
        Object.defineProperty(video, 'videoHeight', { value: 480, writable: true });
        return Promise.resolve();
      }),
      hasTorch: vi.fn().mockReturnValue(true),
      toggleTorch: vi.fn().mockResolvedValue(true),
      pause: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    stateSignal = signal({
      fullImage: undefined,
      detections: [],
      processingTimeMs: 0,
      coordinates: mockCoordinates,
    } as any);

    pipelineServiceMock = {
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn(),
      state: stateSignal,
      detections: computed(() => stateSignal().detections),
      offers: computed(() => stateSignal().offers ?? []),
      debugSettings: signal({
        croppedRegions: true,
        boundingBoxes: true,
        recognizedText: true,
        canonicalText: true,
        lineGrouping: true,
      }),
    };

    historyServiceMock = {
      items: signal([]),
      count: signal(0),
      addCapture: vi.fn().mockReturnValue({ id: '1', timestamp: new Date().toISOString() }),
      deleteItem: vi.fn(),
      clearHistory: vi.fn(),
    };

    userSignal = signal<any>(null);
    authServiceMock = {
      currentUser: userSignal,
      isAuthenticated: computed(() => userSignal() !== null),
      signInWithGoogle: vi.fn().mockImplementation(() => {
        userSignal.set({ id: '123', name: 'Test User', email: 'test@gmail.com' });
      }),
      signOut: vi.fn().mockImplementation(() => {
        userSignal.set(null);
      }),
    };

    priceApiServiceMock = {
      comparePrice: vi.fn().mockReturnValue(of({ rating: 1, averagePrice: 1500 })),
      submitPrice: vi.fn().mockReturnValue(of({ success: true, submissionId: 's1' })),
    };

    const mockContext = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockImplementation((x: number, y: number, w: number, h: number) => {
        return new ImageData(new Uint8ClampedArray(Math.max(1, w * h * 4)), w || 1, h || 1);
      }),
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockContext as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mock');

    await TestBed.configureTestingModule({
      imports: [LensComponent],
      providers: [
        { provide: CameraService, useValue: cameraServiceMock },
        { provide: PipelineService, useValue: pipelineServiceMock },
        { provide: HistoryService, useValue: historyServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: PriceApiService, useValue: priceApiServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LensComponent);
    component = fixture.componentInstance;
  });

  it('should create lens component and initialize camera/pipeline on ngAfterViewInit', async () => {
    await component.ngAfterViewInit();

    expect(cameraServiceMock.start).toHaveBeenCalled();
    expect(pipelineServiceMock.initialize).toHaveBeenCalled();
    expect(component.isTorchSupported()).toBe(true);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should toggle primary action between live and frozen', async () => {
    await component.ngAfterViewInit();

    expect(component.isFrozen()).toBe(false);

    // Click primary button -> freeze
    await component.togglePrimaryAction();
    expect(component.isFrozen()).toBe(true);
    expect(cameraServiceMock.pause).toHaveBeenCalled();
    expect(historyServiceMock.addCapture).toHaveBeenCalled();

    // Click primary button again -> resume
    await component.togglePrimaryAction();
    expect(component.isFrozen()).toBe(false);
    expect(cameraServiceMock.resume).toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should toggle modals including account modal', () => {
    expect(component.activeModal()).toBe('none');

    component.openModal('account');
    expect(component.activeModal()).toBe('account');

    component.signInGoogle();
    expect(authServiceMock.signInWithGoogle).toHaveBeenCalled();

    component.signOut();
    expect(authServiceMock.signOut).toHaveBeenCalled();

    component.closeModal();
    expect(component.activeModal()).toBe('none');
  });

  it('should compare prices but NOT submit when user is guest (unauthenticated)', () => {
    const testOffer: ProductOffer = {
      id: 'off-1',
      product: 'LECHE 1L',
      price: '$1200',
      quantity: { quantity: 1, unit: 'kg' },
      boundingBox: { x: 0, y: 0, width: 100, height: 50 },
      confidence: 0.99,
      detections: [],
    };
    stateSignal.set({
      fullImage: undefined,
      detections: [],
      offers: [testOffer],
      processingTimeMs: 10,
      coordinates: mockCoordinates,
    });

    (component as any).processCompleteOffersBackend();

    expect(priceApiServiceMock.comparePrice).toHaveBeenCalledWith('LECHE 1L', 1200, mockCoordinates);
    expect(priceApiServiceMock.submitPrice).not.toHaveBeenCalled();
  });

  it('should compare prices AND submit when user is authenticated with Google', () => {
    userSignal.set({ id: 'google_u1', name: 'Google User', email: 'user@gmail.com' });

    const testOffer: ProductOffer = {
      id: 'off-2',
      product: 'YERBA MATE',
      price: '$2400',
      quantity: { quantity: 1, unit: 'kg' },
      boundingBox: { x: 0, y: 0, width: 100, height: 50 },
      confidence: 0.99,
      detections: [],
    };
    stateSignal.set({
      fullImage: undefined,
      detections: [],
      offers: [testOffer],
      processingTimeMs: 10,
      coordinates: mockCoordinates,
    });

    (component as any).processCompleteOffersBackend();

    expect(priceApiServiceMock.comparePrice).toHaveBeenCalledWith('YERBA MATE', 2400, mockCoordinates);
    expect(priceApiServiceMock.submitPrice).toHaveBeenCalledWith(testOffer, mockCoordinates);
  });
});
