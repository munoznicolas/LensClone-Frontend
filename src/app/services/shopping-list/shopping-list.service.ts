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

  addItem(name: string, quantity = 1, manualPrice?: number): ShoppingListItem {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error(this.i18n?.t('shoppingList.error.emptyName') ?? 'Item name cannot be empty');
    }

    const newItem: ShoppingListItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: trimmedName,
      quantity: Math.max(1, quantity),
      estimatedUnitPrice: 0,
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

  private loadFromStorage(): ShoppingListItem[] {
    try {
      if (typeof localStorage === 'undefined' || !localStorage.getItem) {
        return [];
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      const cleaned = parsed.filter(
        (item): item is ShoppingListItem =>
          Boolean(item) && typeof item.id === 'string' && !item.id.startsWith('sample_'),
      );
      if (cleaned.length !== parsed.length) {
        this.saveToStorage(cleaned);
      }
      return cleaned;
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
