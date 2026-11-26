import { Component, signal, computed, ElementRef, ViewChild, AfterViewInit, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { HeatmapService, StoreGrocerySummary, StoreLocation } from '../../../services/heatmap/heatmap.service';
import { ShoppingListService, ShoppingListItem } from '../../../services/shopping-list/shopping-list.service';
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

const PRODUCT_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  p1: 'heatmap.product.p1',
  p2: 'heatmap.product.p2',
  p3: 'heatmap.product.p3',
  p4: 'heatmap.product.p4',
  p5: 'heatmap.product.p5',
  p6: 'heatmap.product.p6',
  p7: 'heatmap.product.p7',
  p8: 'heatmap.product.p8',
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

  readonly i18n = inject(I18nService);
  readonly activeMode = signal<HeatmapMode>('groceryList');
  readonly selectedProductId = signal<string>('p1');
  readonly selectedCategoryName = signal<string>('Dairy');
  readonly selectedStoreId = signal<string | null>(null);

  // Leaflet Map & Layer References
  private map?: L.Map;
  private storeMarkersGroup: L.LayerGroup = L.layerGroup();
  private userRadiusGroup: L.LayerGroup = L.layerGroup();

  // Computations
  readonly shoppingItems = computed(() => this.shoppingListService.items());
  readonly categories = computed(() => this.heatmapService.categories());
  readonly productCatalog = computed(() => this.heatmapService.productCatalog());

  readonly activeProduct = computed(() => {
    return this.productCatalog().find((p) => p.id === this.selectedProductId()) || this.productCatalog()[0];
  });

  readonly filteredCatalogByCategory = computed(() => {
    const cat = this.selectedCategoryName();
    return this.productCatalog().filter((p) => p.category === cat);
  });

  // Calculate store scores based on active mode
  readonly storeSummaries = computed<StoreGrocerySummary[]>(() => {
    const mode = this.activeMode();

    if (mode === 'groceryList') {
      return this.heatmapService.calculateStoreSummaries(this.shoppingItems());
    }

    if (mode === 'productFilter') {
      const prod = this.activeProduct();
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
    // Angular signal effect to sync map overlays with state and locale changes
    effect(() => {
      this.i18n.activeLocale();
      const summaries = this.storeSummaries();
      const selectedId = this.selectedStoreId();

      if (this.map) {
        this.renderUserLocationAndRadius(
          this.heatmapService.CENTER_LAT,
          this.heatmapService.CENTER_LNG,
        );
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

    const centerLat = this.heatmapService.CENTER_LAT;
    const centerLng = this.heatmapService.CENTER_LNG;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: [centerLat, centerLng],
      zoom: 12,
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
    this.renderUserLocationAndRadius(centerLat, centerLng);
    this.renderMapLayers(this.storeSummaries(), this.selectedStoreId());

    // Invalidate size after init to ensure full canvas fit
    setTimeout(() => {
      this.map?.invalidateSize();
    }, 200);
  }

  private renderUserLocationAndRadius(lat: number, lng: number): void {
    this.userRadiusGroup.clearLayers();

    // 10km radius circle
    const radiusCircle = L.circle([lat, lng], {
      radius: 10000,
      color: '#3b82f6',
      weight: 1.5,
      dashArray: '6 6',
      fillColor: '#3b82f6',
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
      this.i18n.t('heatmap.map.userTooltip'),
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

  getProductLabel(productId: string, fallbackName: string): string {
    const key = PRODUCT_TRANSLATION_KEYS[productId];
    return key ? this.i18n.t(key) : fallbackName;
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
    if (!summary) return '#94a3b8';

    if (summary.status === 'best') return '#10b981'; // Emerald
    if (summary.status === 'average') return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  }

  mathAbs(val: number): number {
    return Math.abs(val);
  }
}
