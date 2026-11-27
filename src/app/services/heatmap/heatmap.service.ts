import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ShoppingListItem } from '../shopping-list/shopping-list.service';
import { SettingsService } from '../settings/settings.service';

export interface StoreLocation {
  id: string;
  name: string;
  chain: string;
  address: string;
  lat: number;
  lng: number;
  priceMultiplier: number;
}

export interface ProductPriceSample {
  id: string;
  productName: string;
  category: 'Dairy' | 'Bakery' | 'Produce' | 'Beverages' | 'Pantry';
  basePrice: number;
}

export interface StoreGrocerySummary {
  storeId: string;
  storeName: string;
  chain: string;
  address: string;
  lat: number;
  lng: number;
  estimatedBasketTotal: number;
  averageItemPrice: number;
  savingsPercentage: number;
  priceIndexScore: number;
  status: 'best' | 'average' | 'expensive';
  itemCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class HeatmapService {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly settings = inject(SettingsService);
  private activeFetchSub?: Subscription;

  readonly stores = signal<StoreLocation[]>([]);
  readonly productCatalog = signal<ProductPriceSample[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<boolean>(false);

  readonly selectedProduct = signal<string>('ALL');
  readonly selectedCategory = signal<string>('ALL');

  readonly categories = computed(() => {
    const set = new Set<string>();
    for (const p of this.productCatalog()) {
      set.add(p.category);
    }
    return Array.from(set);
  });

  fetchSpatialHeatmap(lat: number, lng: number, radiusKm = this.settings.radiusKm()): void {
    if (!this.http) {
      this.stores.set([]);
      return;
    }

    let endpointUrl: string;
    try {
      const apiBase = this.settings.backendApiUrl();
      const base =
        typeof window !== 'undefined' && window.location?.origin
          ? new URL(apiBase, window.location.origin)
          : new URL(apiBase);
      const url = new URL('/api/v1/stores/heatmap', base);
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('radiusKm', String(radiusKm));
      endpointUrl = url.toString();
    } catch {
      this.stores.set([]);
      this.loadError.set(true);
      return;
    }

    this.activeFetchSub?.unsubscribe();
    this.isLoading.set(true);
    this.loadError.set(false);

    this.activeFetchSub = this.http.get<StoreGrocerySummary[]>(endpointUrl).subscribe({
      next: (data) => {
        const mapped: StoreLocation[] = Array.isArray(data)
          ? data.map((d) => ({
              id: d.storeId,
              name: d.storeName,
              chain: d.chain,
              address: d.address,
              lat: d.lat,
              lng: d.lng,
              priceMultiplier: Math.round((1 - d.savingsPercentage / 100) * 100) / 100,
            }))
          : [];
        this.stores.set(mapped);
        this.isLoading.set(false);
      },
      error: () => {
        this.stores.set([]);
        this.loadError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  getProductPriceAtStore(productName: string, storeId: string, fallbackBasePrice = 0): number {
    const store = this.stores().find((s) => s.id === storeId);
    const multiplier = store ? store.priceMultiplier : 1.0;

    const catalogItem = this.productCatalog().find(
      (p) => p.productName.toLowerCase() === productName.toLowerCase()
    );

    const base = catalogItem ? catalogItem.basePrice : fallbackBasePrice;
    return Math.round(base * multiplier * 100) / 100;
  }

  calculateStoreSummaries(items: ShoppingListItem[]): StoreGrocerySummary[] {
    const storesList = this.stores();

    if (items.length === 0) {
      return storesList.map((s) => ({
        storeId: s.id,
        storeName: s.name,
        chain: s.chain,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        estimatedBasketTotal: 0,
        averageItemPrice: 0,
        savingsPercentage: Math.round((1 - s.priceMultiplier) * 100),
        priceIndexScore: Math.max(0, Math.min(1, (s.priceMultiplier - 0.85) / 0.35)),
        status: s.priceMultiplier < 0.95 ? 'best' : s.priceMultiplier <= 1.08 ? 'average' : 'expensive',
        itemCount: 0,
      }));
    }

    const summaries: StoreGrocerySummary[] = storesList.map((s) => {
      let storeBasketTotal = 0;
      let totalQty = 0;

      for (const item of items) {
        const itemBasePrice = item.manualUnitPrice ?? item.estimatedUnitPrice;
        const itemStorePrice = this.getProductPriceAtStore(item.name, s.id, itemBasePrice);
        storeBasketTotal += itemStorePrice * item.quantity;
        totalQty += item.quantity;
      }

      storeBasketTotal = Math.round(storeBasketTotal * 100) / 100;
      const averageItemPrice = Math.round((storeBasketTotal / (totalQty || 1)) * 100) / 100;
      const savingsPercentage = Math.round((1 - s.priceMultiplier) * 100);
      const priceIndexScore = Math.max(0, Math.min(1, (s.priceMultiplier - 0.85) / 0.35));

      let status: 'best' | 'average' | 'expensive' = 'average';
      if (savingsPercentage > 5) {
        status = 'best';
      } else if (savingsPercentage < -5) {
        status = 'expensive';
      }

      return {
        storeId: s.id,
        storeName: s.name,
        chain: s.chain,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        estimatedBasketTotal: storeBasketTotal,
        averageItemPrice,
        savingsPercentage,
        priceIndexScore,
        status,
        itemCount: items.length,
      };
    });

    return summaries.sort((a, b) => a.estimatedBasketTotal - b.estimatedBasketTotal);
  }
}
