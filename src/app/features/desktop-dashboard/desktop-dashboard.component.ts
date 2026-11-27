import { Component, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DebugComponent } from '../debug/debug.component';
import { SettingsComponent } from '../settings/settings.component';
import { ShoppingListComponent } from '../shopping-list/shopping-list.component';
import { PriceHeatmapComponent } from './price-heatmap/price-heatmap.component';
import { LocationPermissionModalComponent } from '../location-permission-modal/location-permission-modal.component';
import { DeviceService } from '../../services/device/device.service';
import { LocationService } from '../../services/location/location.service';

import { AuthService } from '../../services/auth/auth.service';
import { I18nService } from '../../services/i18n/i18n.service';

export type DesktopTab = 'management' | 'shoppingList' | 'debug' | 'settings';

@Component({
  selector: 'app-desktop-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    DebugComponent,
    SettingsComponent,
    ShoppingListComponent,
    PriceHeatmapComponent,
    LocationPermissionModalComponent,
  ],
  templateUrl: './desktop-dashboard.component.html',
  styleUrl: './desktop-dashboard.component.css',
})
export class DesktopDashboardComponent {
  readonly activeTab = signal<DesktopTab>('management');
  readonly showLocationModal = signal<boolean>(false);

  readonly locationService = inject(LocationService);
  readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);

  constructor(readonly deviceService: DeviceService) {
    effect(() => {
      if (this.activeTab() === 'debug' && !this.authService.isAdmin()) {
        this.activeTab.set('management');
      }
    });
  }

  setTab(tab: DesktopTab): void {
    if (tab === 'debug' && !this.authService.isAdmin()) {
      return;
    }
    this.activeTab.set(tab);
  }

  openLocationModal(): void {
    this.showLocationModal.set(true);
  }

  closeLocationModal(): void {
    this.showLocationModal.set(false);
  }
}
