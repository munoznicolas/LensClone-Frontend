import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { DesktopDashboardComponent } from './desktop-dashboard.component';
import { AuthService } from '../../services/auth/auth.service';
import { CameraService } from '../../services/camera/camera.service';
import { PipelineService } from '../../services/pipeline/pipeline.service';

describe('DesktopDashboardComponent', () => {
  let component: DesktopDashboardComponent;
  let fixture: ComponentFixture<DesktopDashboardComponent>;
  let isAdminSignal: ReturnType<typeof signal<boolean>>;
  let userSignal: ReturnType<typeof signal<any>>;
  let authErrorSignal: ReturnType<typeof signal<string | null>>;

  beforeEach(async () => {
    const mockContext = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      drawImage: vi.fn(),
      getImageData: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockContext as unknown as CanvasRenderingContext2D,
    );

    userSignal = signal<any>(null);
    isAdminSignal = signal<boolean>(false);
    authErrorSignal = signal<string | null>(null);

    const stateSignal = signal({ fullImage: undefined, detections: [], processingTimeMs: 0 } as any);

    await TestBed.configureTestingModule({
      imports: [DesktopDashboardComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentUser: userSignal,
            isAuthenticated: computed(() => userSignal() !== null),
            isAdmin: isAdminSignal.asReadonly(),
            authError: authErrorSignal.asReadonly(),
            signInWithGoogle: vi.fn(),
            signOut: vi.fn(() => {
              userSignal.set(null);
              isAdminSignal.set(false);
            }),
          },
        },
        {
          provide: CameraService,
          useValue: { start: vi.fn().mockResolvedValue(undefined), hasTorch: vi.fn().mockReturnValue(false) },
        },
        {
          provide: PipelineService,
          useValue: {
            initialize: vi.fn().mockResolvedValue(undefined),
            execute: vi.fn(),
            state: stateSignal,
            detections: computed(() => stateSignal().detections),
            offers: computed(() => []),
            processingTimeMs: computed(() => 0),
            fps: computed(() => 0),
            stageMetrics: computed(() => undefined),
            cropsCount: computed(() => 0),
            hasDetections: computed(() => false),
            groupedLines: computed(() => []),
            debugSettings: signal({
              croppedRegions: true,
              boundingBoxes: true,
              recognizedText: true,
              canonicalText: true,
              lineGrouping: true,
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DesktopDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  it('should hide Diagnostics tab and block setTab("debug") for guest and non-admin users', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Diagnostics');

    component.setTab('debug');
    fixture.detectChanges();
    expect(component.activeTab()).toBe('management');
    expect(el.querySelector('app-debug')).toBeNull();

    // Non-admin Google login
    userSignal.set({ id: 'u1', name: 'Regular User', email: 'user@example.com', idToken: 'tok' });
    isAdminSignal.set(false);
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Diagnostics');
    component.setTab('debug');
    expect(component.activeTab()).toBe('management');
  });

  it('should hide Backend API Base URL in Settings for non-admins and show it for admins', () => {
    component.setTab('settings');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#inline-apiUrl')).toBeNull();

    isAdminSignal.set(true);
    fixture.detectChanges();
    expect(el.querySelector('#inline-apiUrl')).not.toBeNull();
  });

  it('should show Diagnostics tab for admins and reset to management if admin status is revoked', () => {
    userSignal.set({ id: 'admin1', name: 'Admin', email: 'admin@example.com', idToken: 'tok' });
    isAdminSignal.set(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Diagnostics');

    component.setTab('debug');
    fixture.detectChanges();
    expect(component.activeTab()).toBe('debug');
    expect(el.querySelector('app-debug')).not.toBeNull();

    // Revoke admin / sign out while on debug tab
    isAdminSignal.set(false);
    fixture.detectChanges();
    expect(component.activeTab()).toBe('management');
    expect(el.querySelector('app-debug')).toBeNull();
  }, 15000);
});
