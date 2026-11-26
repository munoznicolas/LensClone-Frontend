import { Component, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocationService, LocationAccuracyMode } from '../../services/location/location.service';
import { I18nService } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-location-permission-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './location-permission-modal.component.html',
  styleUrl: './location-permission-modal.component.css',
})
export class LocationPermissionModalComponent {
  readonly locationService = inject(LocationService);
  readonly i18n = inject(I18nService);

  selectedMode: LocationAccuracyMode = this.locationService.accuracyMode();

  @Output() permissionGranted = new EventEmitter<{ mode: LocationAccuracyMode }>();
  @Output() permissionDenied = new EventEmitter<void>();

  selectMode(mode: LocationAccuracyMode): void {
    this.selectedMode = mode;
  }

  confirmPermission(): void {
    this.locationService.setAccuracyMode(this.selectedMode);
    this.locationService.startTracking();
    this.permissionGranted.emit({ mode: this.selectedMode });
  }

  denyPermission(): void {
    this.locationService.setPromptDismissed(true);
    this.permissionDenied.emit();
  }
}
