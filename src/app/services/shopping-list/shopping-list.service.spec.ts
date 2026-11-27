import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ShoppingListService } from './shopping-list.service';

describe('ShoppingListService', () => {
  let service: ShoppingListService;
  let localStore: Map<string, string>;

  beforeEach(() => {
    localStore = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) => localStore.set(key, value),
      removeItem: (key: string) => localStore.delete(key),
      clear: () => localStore.clear(),
      length: 0,
      key: () => null,
    });
    TestBed.configureTestingModule({
      providers: [ShoppingListService],
    });
    service = TestBed.inject(ShoppingListService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should start empty with no seeded sample items', () => {
    expect(service).toBeTruthy();
    expect(service.itemCount()).toBe(0);
    expect(service.items()).toEqual([]);
  });

  it('should strip legacy sample_* items from localStorage while keeping user items', () => {
    localStore.set(
      'lensclone_shopping_list_v1',
      JSON.stringify([
        { id: 'sample_1', name: 'Organic Whole Milk 1L', quantity: 2, estimatedUnitPrice: 3.49 },
        { id: 'item_123', name: 'Coffee', quantity: 1, estimatedUnitPrice: 0, manualUnitPrice: 5.25 },
      ]),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ShoppingListService] });
    const reloaded = TestBed.inject(ShoppingListService);

    expect(reloaded.itemCount()).toBe(1);
    expect(reloaded.items()[0].id).toBe('item_123');
    const persisted = JSON.parse(localStore.get('lensclone_shopping_list_v1') ?? '[]');
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe('item_123');
  });

  it('should add item with 0 estimatedUnitPrice when no manual price is given and compute total', () => {
    const noPrice = service.addItem('Milk', 2);
    expect(noPrice.estimatedUnitPrice).toBe(0);
    expect(noPrice.manualUnitPrice).toBeUndefined();

    service.addItem('Eggs', 1, 4.00);

    expect(service.itemCount()).toBe(2);
    expect(service.totalQuantity()).toBe(3);
    expect(service.totalEstimatedExpenditure()).toBe(4.00);
  });

  it('should update quantity and remove item if quantity is zero', () => {
    const item = service.addItem('Bread', 1, 2.50);
    service.updateQuantity(item.id, 3);
    expect(service.totalEstimatedExpenditure()).toBe(7.50);

    service.updateQuantity(item.id, 0);
    expect(service.itemCount()).toBe(0);
  });
});
