import { Component, HostListener, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings/settings.service';
import { LocationService, LocationAccuracyMode } from '../../services/location/location.service';
import { AuthService } from '../../services/auth/auth.service';
import { I18nService, LanguagePreference } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  @Input() inline = false;

  readonly settingsService = inject(SettingsService);
  readonly locationService = inject(LocationService);
  readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);

  readonly isOpen = signal(false);
  readonly savedNotification = signal(false);

  // Form model values
  readonly timeWindowPresets = [7, 14, 30, 90] as const;
  readonly radiusPresets = [0.5, 1, 2.5, 5] as const;

  language: LanguagePreference = this.i18n.preference();
  timeWindowDays = this.settingsService.timeWindowDays();
  radiusKm = this.snapRadius(this.settingsService.radiusKm());
  tolerancePercent = this.settingsService.tolerancePercent();
  backendApiUrl = this.settingsService.backendApiUrl();
  locationAccuracyMode: LocationAccuracyMode = this.locationService.accuracyMode();

  get timeWindowIndex(): number {
    const idx = this.timeWindowPresets.indexOf(
      this.timeWindowDays as (typeof this.timeWindowPresets)[number],
    );
    return idx >= 0 ? idx : 1;
  }

  get radiusIndex(): number {
    const idx = this.radiusPresets.indexOf(
      this.radiusKm as (typeof this.radiusPresets)[number],
    );
    return idx >= 0 ? idx : 2;
  }

  onTimeWindowSliderInput(event: Event): void {
    const idx = Number((event.target as HTMLInputElement).value);
    this.timeWindowDays = this.timeWindowPresets[idx] ?? 14;
  }

  onRadiusSliderInput(event: Event): void {
    const idx = Number((event.target as HTMLInputElement).value);
    this.radiusKm = this.radiusPresets[idx] ?? 2.5;
  }

  formatRadius(km: number): string {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;
  }

  private snapRadius(km: number): number {
    return this.radiusPresets.reduce((best, preset) =>
      Math.abs(preset - km) < Math.abs(best - km) ? preset : best,
    );
  }

  timeWindowLabel(days: number): string {
    const keyMap = {
      7: 'settings.timeWindow.option7',
      14: 'settings.timeWindow.option14',
      30: 'settings.timeWindow.option30',
      90: 'settings.timeWindow.option90',
    } as const;
    const key = keyMap[days as keyof typeof keyMap] ?? 'settings.timeWindow.option14';
    return this.i18n.t(key);
  }

  openModal(): void {
    this.language = this.i18n.preference();
    this.timeWindowDays = this.settingsService.timeWindowDays();
    this.radiusKm = this.snapRadius(this.settingsService.radiusKm());
    this.tolerancePercent = this.settingsService.tolerancePercent();
    this.backendApiUrl = this.settingsService.backendApiUrl();
    this.locationAccuracyMode = this.locationService.accuracyMode();
    this.isOpen.set(true);
  }

  closeModal(): void {
    this.isOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isOpen()) {
      this.closeModal();
    }
  }

  saveSettings(): void {
    this.i18n.setPreference(this.language);
    this.settingsService.updateSettings({
      timeWindowDays: Number(this.timeWindowDays),
      radiusKm: Number(this.radiusKm),
      tolerancePercent: Number(this.tolerancePercent),
      ...(this.authService.isAdmin() ? { backendApiUrl: this.backendApiUrl } : {}),
    });
    this.locationService.setAccuracyMode(this.locationAccuracyMode);
    this.closeModal();
    this.savedNotification.set(true);
    setTimeout(() => this.savedNotification.set(false), 3000);
  }
}
