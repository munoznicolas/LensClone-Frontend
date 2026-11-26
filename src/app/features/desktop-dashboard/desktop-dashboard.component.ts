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

  // Sample analytics data for PC management view
  readonly recentUploads = signal([
    { id: '1', product: 'Organic Milk 1L', price: '$3.49', confidence: 0.96, location: 'Store A', timestamp: '10 mins ago' },
    { id: '2', product: 'Whole Wheat Bread', price: '$2.99', confidence: 0.94, location: 'Store B', timestamp: '25 mins ago' },
    { id: '3', product: 'Avocado 2-pack', price: '$4.20', confidence: 0.89, location: 'Store A', timestamp: '1 hour ago' },
  ]);

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
