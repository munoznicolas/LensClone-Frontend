import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShoppingListComponent } from './shopping-list.component';
import { ShoppingListService } from '../../services/shopping-list/shopping-list.service';

describe('ShoppingListComponent', () => {
  let component: ShoppingListComponent;
  let fixture: ComponentFixture<ShoppingListComponent>;
  let service: ShoppingListService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingListComponent],
      providers: [ShoppingListService],
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingListComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(ShoppingListService);
    fixture.detectChanges();
  });

  it('should create shopping list component with empty state and no quick-add presets', () => {
    expect(component).toBeTruthy();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.presets-section')).toBeNull();
    expect(el.querySelector('.empty-state')).not.toBeNull();
    expect(service.itemCount()).toBe(0);
  });

  it('should add item from form inputs', () => {
    component.newItemName.set('Bananas');
    component.newItemQty.set(2);

    component.addItem();

    expect(service.itemCount()).toBeGreaterThan(0);
    const added = service.items().find((i) => i.name === 'Bananas');
    expect(added).toBeTruthy();
    expect(added?.quantity).toBe(2);
  });
});
