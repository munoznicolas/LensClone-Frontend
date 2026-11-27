import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShoppingListService, ShoppingListItem } from '../../services/shopping-list/shopping-list.service';
import { I18nService } from '../../services/i18n/i18n.service';

@Component({
  selector: 'app-shopping-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shopping-list.component.html',
  styleUrl: './shopping-list.component.css',
})
export class ShoppingListComponent {
  readonly i18n = inject(I18nService);

  readonly newItemName = signal('');
  readonly newItemQty = signal(1);
  readonly newItemPrice = signal<number | null>(null);

  constructor(readonly shoppingList: ShoppingListService) {}

  addItem(): void {
    const name = this.newItemName().trim();
    if (!name) return;

    const qty = this.newItemQty();
    const price = this.newItemPrice();

    this.shoppingList.addItem(name, qty, price ?? undefined);

    // Reset inputs
    this.newItemName.set('');
    this.newItemQty.set(1);
    this.newItemPrice.set(null);
  }

  updateQty(item: ShoppingListItem, delta: number): void {
    this.shoppingList.updateQuantity(item.id, item.quantity + delta);
  }

  onPriceChange(item: ShoppingListItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = Number.parseFloat(input.value);
    if (!Number.isNaN(val) && val > 0) {
      this.shoppingList.updateUnitPrice(item.id, val);
    } else {
      this.shoppingList.updateUnitPrice(item.id, undefined);
    }
  }
}
