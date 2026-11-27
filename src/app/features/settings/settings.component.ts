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
  language: LanguagePreference = this.i18n.preference();
  timeWindowDays = this.settingsService.timeWindowDays();
  radiusKm = this.settingsService.radiusKm();
  tolerancePercent = this.settingsService.tolerancePercent();
  backendApiUrl = this.settingsService.backendApiUrl();
  locationAccuracyMode: LocationAccuracyMode = this.locationService.accuracyMode();

  detectedLocaleLabel(): string {
    return this.i18n.t(
      this.i18n.navigatorLocale() === 'es-AR'
        ? 'settings.language.localeName.esAr'
        : 'settings.language.localeName.enUs',
    );
  }

  openModal(): void {
    this.language = this.i18n.preference();
    this.timeWindowDays = this.settingsService.timeWindowDays();
    this.radiusKm = this.settingsService.radiusKm();
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
