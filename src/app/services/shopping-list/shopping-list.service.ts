import { Injectable, signal, computed, inject } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';

export interface ShoppingListItem {
  id: string;
  name: string;
  quantity: number;
  estimatedUnitPrice: number;
  manualUnitPrice?: number;
  unitLabel?: string;
}

const STORAGE_KEY = 'lensclone_shopping_list_v1';

// Initial reference baseline prices for common items (USD)
const BASELINE_PRICE_CATALOG: Record<string, number> = {
  milk: 3.49,
  leche: 3.49,
  bread: 2.80,
  pan: 2.80,
  eggs: 3.99,
  huevos: 3.99,
  huevo: 3.99,
  coffee: 7.50,
  café: 7.50,
  cafe: 7.50,
  apples: 1.99,
  manzanas: 1.99,
  manzana: 1.99,
  bananas: 0.89,
  banana: 0.89,
  cheese: 4.50,
  queso: 4.50,
  butter: 3.75,
  manteca: 3.75,
  yogurt: 2.20,
  yogur: 2.20,
  chicken: 6.99,
  pollo: 6.99,
  rice: 2.49,
  arroz: 2.49,
  pasta: 1.79,
  fideos: 1.79,
  cereal: 4.29,
  water: 1.29,
  agua: 1.29,
  juice: 3.29,
  jugo: 3.29,
};

@Injectable({
  providedIn: 'root',
})
export class ShoppingListService {
  private readonly i18n = inject(I18nService, { optional: true });
  private readonly _items = signal<ShoppingListItem[]>(this.loadFromStorage());

  readonly items = computed(() => this._items());
  readonly itemCount = computed(() => this._items().length);

  readonly totalQuantity = computed(() =>
    this._items().reduce((sum, item) => sum + item.quantity, 0)
  );

  readonly totalEstimatedExpenditure = computed(() =>
    this._items().reduce((total, item) => {
      const activePrice = item.manualUnitPrice ?? item.estimatedUnitPrice;
      return total + item.quantity * activePrice;
    }, 0)
  );

  constructor() {
    // Populate default list if empty on first load
    if (this._items().length === 0) {
      this.addInitialSamples();
    }
  }

  addItem(name: string, quantity = 1, manualPrice?: number): ShoppingListItem {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error(this.i18n?.t('shoppingList.error.emptyName') ?? 'Item name cannot be empty');
    }

    const estimatedUnitPrice = this.estimateUnitPrice(trimmedName);

    const newItem: ShoppingListItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: trimmedName,
      quantity: Math.max(1, quantity),
      estimatedUnitPrice,
      manualUnitPrice: manualPrice !== undefined && manualPrice > 0 ? manualPrice : undefined,
    };

    const updated = [...this._items(), newItem];
    this._items.set(updated);
    this.saveToStorage(updated);
    return newItem;
  }

  updateQuantity(id: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(id);
      return;
    }

    const updated = this._items().map((item) =>
      item.id === id ? { ...item, quantity } : item
    );
    this._items.set(updated);
    this.saveToStorage(updated);
  }

  updateUnitPrice(id: string, price: number | undefined): void {
    const updated = this._items().map((item) =>
      item.id === id ? { ...item, manualUnitPrice: price && price > 0 ? price : undefined } : item
    );
    this._items.set(updated);
    this.saveToStorage(updated);
  }

  removeItem(id: string): void {
    const updated = this._items().filter((item) => item.id !== id);
    this._items.set(updated);
    this.saveToStorage(updated);
  }

  clearList(): void {
    this._items.set([]);
    this.saveToStorage([]);
  }

  estimateUnitPrice(name: string): number {
    const normalized = name.toLowerCase();
    for (const [key, price] of Object.entries(BASELINE_PRICE_CATALOG)) {
      if (normalized.includes(key)) {
        return price;
      }
    }
    // Default estimate if not in sample catalog
    return 3.50;
  }

  private addInitialSamples(): void {
    const samples: ShoppingListItem[] = [
      {
        id: 'sample_1',
        name: this.i18n?.t('shoppingList.samples.milk') ?? 'Organic Whole Milk 1L',
        quantity: 2,
        estimatedUnitPrice: 3.49,
      },
      {
        id: 'sample_2',
        name: this.i18n?.t('shoppingList.samples.eggs') ?? 'Large Brown Eggs 12-pack',
        quantity: 1,
        estimatedUnitPrice: 3.99,
      },
      {
        id: 'sample_3',
        name: this.i18n?.t('shoppingList.samples.bread') ?? 'Whole Wheat Bread',
        quantity: 1,
        estimatedUnitPrice: 2.80,
      },
    ];
    this._items.set(samples);
    this.saveToStorage(samples);
  }

  private loadFromStorage(): ShoppingListItem[] {
    try {
      if (typeof localStorage === 'undefined' || !localStorage.getItem) {
        return [];
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(items: ShoppingListItem[]): void {
    try {
      if (typeof localStorage === 'undefined' || !localStorage.setItem) {
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage error fallback
    }
  }
}
