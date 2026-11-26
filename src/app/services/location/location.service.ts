import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { GpsCoordinates } from '../text-detection/types';
import { I18nService } from '../i18n/i18n.service';

export type LocationAccuracyMode = 'precise' | 'approximate';

const STORAGE_KEY_ACCURACY_MODE = 'lensclone_location_accuracy_mode';

@Injectable({
  providedIn: 'root',
})
export class LocationService implements OnDestroy {
  private readonly i18n = inject(I18nService);
  private watchId?: number;

  private readonly _coordinates = signal<GpsCoordinates | null>(null);
  private readonly _isTracking = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _permissionStatus = signal<PermissionState | 'unknown'>('unknown');
  private readonly _accuracyMode = signal<LocationAccuracyMode>('approximate');
  private readonly _promptDismissed = signal<boolean>(false);

  readonly coordinates = this._coordinates.asReadonly();
  readonly isTracking = this._isTracking.asReadonly();
  readonly error = this._error.asReadonly();
  readonly permissionStatus = this._permissionStatus.asReadonly();
  readonly accuracyMode = this._accuracyMode.asReadonly();
  readonly promptDismissed = this._promptDismissed.asReadonly();

  constructor() {
    this.loadSavedMode();
    this.checkPermissions();
  }

  ngOnDestroy(): void {
    this.stopTracking();
  }

  private loadSavedMode(): void {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_ACCURACY_MODE) as LocationAccuracyMode | null;
      if (saved === 'precise' || saved === 'approximate') {
        this._accuracyMode.set(saved);
      }
    }
  }

  setAccuracyMode(mode: LocationAccuracyMode): void {
    this._accuracyMode.set(mode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_ACCURACY_MODE, mode);
    }

    if (this._isTracking()) {
      this.stopTracking();
      this.startTracking();
    }
  }

  setPromptDismissed(dismissed: boolean): void {
    this._promptDismissed.set(dismissed);
  }

  startTracking(options?: PositionOptions): void {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this._error.set(this.i18n.t('location.error.unsupported'));
      return;
    }

    if (this._isTracking()) {
      return;
    }

    const currentMode = this._accuracyMode();
    const defaultOptions: PositionOptions = {
      enableHighAccuracy: currentMode === 'precise',
      timeout: 10000,
      maximumAge: currentMode === 'precise' ? 5000 : 30000,
      ...options,
    };

    this._isTracking.set(true);
    this._error.set(null);

    try {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.handleSuccess(pos),
        (err) => this.handleError(err),
        defaultOptions,
      );
    } catch (err: any) {
      this._isTracking.set(false);
      this._error.set(err?.message || this.i18n.t('location.error.startFailed'));
    }
  }

  stopTracking(): void {
    if (this.watchId !== undefined && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = undefined;
    }
    this._isTracking.set(false);
  }

  getCurrentCoordinates(): GpsCoordinates | null {
    return this._coordinates();
  }

  /**
   * Rounds latitude and longitude to 2 decimal places (~1.1km grid resolution)
   * to guarantee approximate regional location for privacy and security.
   */
  roundToApproximate(lat: number, lon: number): { latitude: number; longitude: number } {
    return {
      latitude: Math.round(lat * 100) / 100,
      longitude: Math.round(lon * 100) / 100,
    };
  }

  private handleSuccess(position: GeolocationPosition): void {
    const currentMode = this._accuracyMode();
    const isPrecise = currentMode === 'precise';

    let latitude: number;
    let longitude: number;

    if (isPrecise) {
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } else {
      const rounded = this.roundToApproximate(position.coords.latitude, position.coords.longitude);
      latitude = rounded.latitude;
      longitude = rounded.longitude;
    }

    const gpsCoords: GpsCoordinates = {
      latitude,
      longitude,
      isApproximate: !isPrecise,
      accuracyMode: currentMode,
      accuracyMeters: Math.round(position.coords.accuracy),
      timestamp: position.timestamp,
    };

    this._coordinates.set(gpsCoords);
    this._error.set(null);
    this._permissionStatus.set('granted');
  }

  private handleError(error: GeolocationPositionError): void {
    let msg = this.i18n.t('location.error.generic');
    switch (error.code) {
      case error.PERMISSION_DENIED:
        msg = this.i18n.t('location.error.permissionDenied');
        this._permissionStatus.set('denied');
        break;
      case error.POSITION_UNAVAILABLE:
        msg = this.i18n.t('location.error.unavailable');
        break;
      case error.TIMEOUT:
        msg = this.i18n.t('location.error.timeout');
        break;
    }
    this._error.set(msg);
  }

  private async checkPermissions(): Promise<void> {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        this._permissionStatus.set(status.state);
        status.onchange = () => {
          this._permissionStatus.set(status.state);
        };
      } catch {
        this._permissionStatus.set('unknown');
      }
    }
  }
}
