import { Component, signal, computed, ElementRef, ViewChild, AfterViewInit, OnDestroy, effect, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { HeatmapService, StoreGrocerySummary } from '../../../services/heatmap/heatmap.service';
import { ShoppingListService, ShoppingListItem } from '../../../services/shopping-list/shopping-list.service';
import { LocationService } from '../../../services/location/location.service';
import { SettingsService } from '../../../services/settings/settings.service';
import { I18nService } from '../../../services/i18n/i18n.service';
import { TranslationKey } from '../../../services/i18n/translations.en-us';

export type HeatmapMode = 'groceryList' | 'productFilter' | 'categoryFilter';

const CATEGORY_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  Dairy: 'heatmap.category.Dairy',
  Bakery: 'heatmap.category.Bakery',
  Produce: 'heatmap.category.Produce',
  Beverages: 'heatmap.category.Beverages',
  Pantry: 'heatmap.category.Pantry',
};

@Component({
  selector: 'app-price-heatmap',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './price-heatmap.component.html',
  styleUrl: './price-heatmap.component.css',
})
export class PriceHeatmapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef<HTMLDivElement>;

  readonly requestLocation = output<void>();

  readonly i18n = inject(I18nService);
  readonly locationService = inject(LocationService);
  readonly settingsService = inject(SettingsService);
  readonly activeMode = signal<HeatmapMode>('groceryList');
  readonly selectedProductId = signal<string>('');
  readonly selectedCategoryName = signal<string>('');
  readonly selectedStoreId = signal<string | null>(null);

  // Leaflet Map & Layer References
  private map?: L.Map;
  private storeMarkersGroup: L.LayerGroup = L.layerGroup();
  private userRadiusGroup: L.LayerGroup = L.layerGroup();
  private lastFetchKey: string | null = null;
  private lastCenteredKey: string | null = null;

  // Computations
  readonly shoppingItems = computed(() => this.shoppingListService.items());
  readonly categories = computed(() => this.heatmapService.categories());
  readonly productCatalog = computed(() => this.heatmapService.productCatalog());

  readonly activeProduct = computed(() => {
    const catalog = this.productCatalog();
    if (catalog.length === 0) return undefined;
    return catalog.find((p) => p.id === this.selectedProductId()) || catalog[0];
  });

  readonly activeCategory = computed(() => {
    return this.selectedCategoryName() || this.categories()[0] || '';
  });

  readonly filteredCatalogByCategory = computed(() => {
    const cat = this.activeCategory();
    return cat ? this.productCatalog().filter((p) => p.category === cat) : [];
  });

  // Calculate store scores based on active mode
  readonly storeSummaries = computed<StoreGrocerySummary[]>(() => {
    const mode = this.activeMode();

    if (mode === 'groceryList') {
      return this.heatmapService.calculateStoreSummaries(this.shoppingItems());
    }

    if (mode === 'productFilter') {
      const prod = this.activeProduct();
      if (!prod) return [];
      const syntheticItems: ShoppingListItem[] = [
        {
          id: 'filter_item',
          name: prod.productName,
          quantity: 1,
          estimatedUnitPrice: prod.basePrice,
        },
      ];
      return this.heatmapService.calculateStoreSummaries(syntheticItems);
    }

    // Category Filter Mode
    const catProds = this.filteredCatalogByCategory();
    if (catProds.length === 0) return [];
    const categorySyntheticItems: ShoppingListItem[] = catProds.map((p) => ({
      id: `cat_${p.id}`,
      name: p.productName,
      quantity: 1,
      estimatedUnitPrice: p.basePrice,
    }));

    return this.heatmapService.calculateStoreSummaries(categorySyntheticItems);
  });

  readonly bestStore = computed(() => {
    const sorted = this.storeSummaries();
    return sorted.length > 0 ? sorted[0] : null;
  });

  constructor(
    readonly heatmapService: HeatmapService,
    readonly shoppingListService: ShoppingListService
  ) {
    // Auto-start GPS tracking if permission was already granted
    effect(() => {
      if (
        this.locationService.permissionStatus() === 'granted' &&
        !this.locationService.isTracking() &&
        !this.locationService.coordinates()
      ) {
        this.locationService.startTracking();
      }
    });

    // Fetch live stores from backend whenever GPS coordinates or radius change
    effect(() => {
      const coords = this.locationService.coordinates();
      const radiusKm = this.settingsService.radiusKm();
      const apiUrl = this.settingsService.backendApiUrl();
      if (!coords) {
        this.lastFetchKey = null;
        return;
      }

      const key = `${coords.latitude},${coords.longitude},${radiusKm},${apiUrl}`;
      if (key === this.lastFetchKey) return;
      this.lastFetchKey = key;
      this.heatmapService.fetchSpatialHeatmap(coords.latitude, coords.longitude, radiusKm);
    });

    // Angular signal effect to sync map overlays with state, location, and locale changes
    effect(() => {
      this.i18n.activeLocale();
      const coords = this.locationService.coordinates();
      const radiusKm = this.settingsService.radiusKm();
      const summaries = this.storeSummaries();
      const selectedId = this.selectedStoreId();

      if (this.map) {
        if (coords) {
          const coordKey = `${coords.latitude},${coords.longitude}`;
          if (coordKey !== this.lastCenteredKey) {
            this.lastCenteredKey = coordKey;
            this.map.setView([coords.latitude, coords.longitude], 12);
          }
          this.renderUserLocationAndRadius(coords.latitude, coords.longitude, radiusKm);
        } else {
          this.lastCenteredKey = null;
          this.userRadiusGroup.clearLayers();
        }
        this.renderMapLayers(summaries, selectedId);
      }
    });
  }

  ngAfterViewInit(): void {
    this.initLeafletMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
  }

  private initLeafletMap(): void {
    if (!this.mapContainer || typeof window === 'undefined') return;

    const coords = this.locationService.coordinates();
    const centerLat = coords ? coords.latitude : 0;
    const centerLng = coords ? coords.longitude : 0;
    const initialZoom = coords ? 12 : 2;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: [centerLat, centerLng],
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: false,
    });

    // Google Maps Tile Layer
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 19,
    }).addTo(this.map);

    // Add layer groups to map
    this.storeMarkersGroup.addTo(this.map);
    this.userRadiusGroup.addTo(this.map);

    // Initial layer render
    if (coords) {
      this.lastCenteredKey = `${coords.latitude},${coords.longitude}`;
      this.renderUserLocationAndRadius(coords.latitude, coords.longitude, this.settingsService.radiusKm());
    }
    this.renderMapLayers(this.storeSummaries(), this.selectedStoreId());

    // Invalidate size after init to ensure full canvas fit
    setTimeout(() => {
      this.map?.invalidateSize();
    }, 200);
  }

  private cssVar(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  private renderUserLocationAndRadius(lat: number, lng: number, radiusKm: number): void {
    this.userRadiusGroup.clearLayers();
    const brandColor = this.cssVar('--color-brand', '#2e6f40');

    const radiusCircle = L.circle([lat, lng], {
      radius: radiusKm * 1000,
      color: brandColor,
      weight: 1.5,
      dashArray: '6 6',
      fillColor: brandColor,
      fillOpacity: 0.04,
      interactive: false,
    });
    this.userRadiusGroup.addLayer(radiusCircle);

    // User center marker
    const userMarkerIcon = L.divIcon({
      className: 'user-location-marker',
      html: `
        <div class="user-pulse-container">
          <div class="pulse-ring"></div>
          <div class="user-dot">
            <span class="material-symbols-rounded">person_pin_circle</span>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const userMarker = L.marker([lat, lng], { icon: userMarkerIcon }).bindTooltip(
      this.i18n.t('heatmap.map.userTooltip', { radius: radiusKm }),
      {
        permanent: false,
        direction: 'top',
        className: 'custom-tooltip',
      },
    );
    this.userRadiusGroup.addLayer(userMarker);
  }

  private renderMapLayers(summaries: StoreGrocerySummary[], selectedId: string | null): void {
    if (!this.map) return;

    this.storeMarkersGroup.clearLayers();

    for (const summary of summaries) {
      const isSelected = selectedId === summary.storeId;
      const color = this.getStoreColor(summary.storeId);
      const chainLabel = this.getChainLabel(summary.chain);
      const totalFormatted = this.i18n.formatNumber(summary.estimatedBasketTotal, 2);
      const vsCityText =
        summary.savingsPercentage >= 0
          ? this.i18n.t('heatmap.card.cheaper', { pct: summary.savingsPercentage })
          : this.i18n.t('heatmap.card.higher', { pct: Math.abs(summary.savingsPercentage) });

      const icon = L.divIcon({
        className: 'store-pin-wrapper',
        html: `
          <div class="store-pin-badge ${summary.status} ${isSelected ? 'selected' : ''}" style="background-color: ${color}">
            <span class="store-code">${summary.storeId.toUpperCase()}</span>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([summary.lat, summary.lng], { icon });

      const popupContent = `
        <div class="map-popup-card">
          <div class="popup-header" style="border-left: 4px solid ${color}">
            <h5>${summary.storeName}</h5>
            <span class="chain-tag">${chainLabel}</span>
          </div>
          <div class="popup-body">
            <p class="address-text"><span class="material-symbols-rounded icon-small">location_on</span> ${summary.address}</p>
            <p class="gps-coords">GPS: ${summary.lat.toFixed(5)}, ${summary.lng.toFixed(5)}</p>
            <p class="price-line"><strong>${this.i18n.t('heatmap.map.popup.estimatedTotal')}</strong> $${totalFormatted}</p>
            <p class="savings-text"><strong>${this.i18n.t('heatmap.map.popup.vsCityAvg')}</strong> ${vsCityText}</p>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { className: 'custom-leaflet-popup' });
      marker.on('click', () => {
        this.selectStore(summary.storeId);
      });

      this.storeMarkersGroup.addLayer(marker);
    }
  }

  getCategoryLabel(category: string): string {
    const key = CATEGORY_TRANSLATION_KEYS[category];
    return key ? this.i18n.t(key) : category;
  }

  getChainLabel(chain: string): string {
    return chain === 'Local Grocery' ? this.i18n.t('heatmap.chain.localGrocery') : chain;
  }

  setMode(mode: HeatmapMode): void {
    this.activeMode.set(mode);
    this.selectedStoreId.set(null);
  }

  selectProduct(productId: string): void {
    this.selectedProductId.set(productId);
  }

  selectCategory(category: string): void {
    this.selectedCategoryName.set(category);
  }

  selectStore(storeId: string): void {
    if (this.selectedStoreId() === storeId) {
      this.selectedStoreId.set(null);
    } else {
      this.selectedStoreId.set(storeId);

      // Pan map to selected store GPS location if available
      const store = this.storeSummaries().find((s) => s.storeId === storeId);
      if (store && this.map) {
        this.map.flyTo([store.lat, store.lng], 14, { duration: 0.8 });
      }
    }
  }

  getStoreSummary(storeId: string): StoreGrocerySummary | undefined {
    return this.storeSummaries().find((s) => s.storeId === storeId);
  }

  getStoreColor(storeId: string): string {
    const summary = this.getStoreSummary(storeId);
    if (!summary) return this.cssVar('--color-text-muted', '#5b665d');

    if (summary.status === 'best') return this.cssVar('--color-brand', '#2e6f40');
    if (summary.status === 'average') return this.cssVar('--color-deal', '#d97706');
    return this.cssVar('--color-danger', '#dc2626');
  }

  mathAbs(val: number): number {
    return Math.abs(val);
  }
}
