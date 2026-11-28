import { Injectable, signal } from '@angular/core';

export interface AppSettings {
  timeWindowDays: number;
  radiusKm: number;
  tolerancePercent: number;
  backendApiUrl: string;
}

const SETTINGS_STORAGE_KEY = 'lensclone_app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  timeWindowDays: 14,
  radiusKm: 2.5,
  tolerancePercent: 5,
  backendApiUrl: 'https://d10oghpahlcf95.cloudfront.net/api/v1/prices',
};

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  readonly timeWindowDays = signal<number>(DEFAULT_SETTINGS.timeWindowDays);
  readonly radiusKm = signal<number>(DEFAULT_SETTINGS.radiusKm);
  readonly tolerancePercent = signal<number>(DEFAULT_SETTINGS.tolerancePercent);
  readonly backendApiUrl = signal<string>(DEFAULT_SETTINGS.backendApiUrl);

  constructor() {
    this.loadFromStorage();
  }

  updateSettings(settings: Partial<AppSettings>): void {
    if (settings.timeWindowDays !== undefined) {
      this.timeWindowDays.set(settings.timeWindowDays);
    }
    if (settings.radiusKm !== undefined) {
      this.radiusKm.set(settings.radiusKm);
    }
    if (settings.tolerancePercent !== undefined) {
      this.tolerancePercent.set(settings.tolerancePercent);
    }
    if (settings.backendApiUrl !== undefined) {
      this.backendApiUrl.set(settings.backendApiUrl);
    }
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AppSettings>;
        if (parsed.timeWindowDays) this.timeWindowDays.set(parsed.timeWindowDays);
        if (parsed.radiusKm) this.radiusKm.set(parsed.radiusKm);
        if (parsed.tolerancePercent) this.tolerancePercent.set(parsed.tolerancePercent);
        if (parsed.backendApiUrl) this.backendApiUrl.set(parsed.backendApiUrl);
      }
    } catch {
      // Fall back to default signals on storage errors
    }
  }

  private saveToStorage(): void {
    try {
      const payload: AppSettings = {
        timeWindowDays: this.timeWindowDays(),
        radiusKm: this.radiusKm(),
        tolerancePercent: this.tolerancePercent(),
        backendApiUrl: this.backendApiUrl(),
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage write errors
    }
  }
}
