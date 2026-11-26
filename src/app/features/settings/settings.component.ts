import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings/settings.service';
import { LocationService, LocationAccuracyMode } from '../../services/location/location.service';
import { AuthService } from '../../services/auth/auth.service';

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

  readonly isOpen = signal(false);
  readonly savedNotification = signal(false);

  // Form model values
  timeWindowDays = this.settingsService.timeWindowDays();
  radiusKm = this.settingsService.radiusKm();
  tolerancePercent = this.settingsService.tolerancePercent();
  backendApiUrl = this.settingsService.backendApiUrl();
  locationAccuracyMode: LocationAccuracyMode = this.locationService.accuracyMode();

  openModal(): void {
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

  saveSettings(): void {
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
