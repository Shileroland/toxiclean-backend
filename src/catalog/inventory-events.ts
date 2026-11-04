import { Injectable } from '@nestjs/common';
import type { User } from '../users/user.entity.js';
import type { Product, StockMovement, Supplier } from './catalog.entity.js';

export type StockReceived = {
  movement: StockMovement;
  product: Product;
  supplier: Supplier;
  totalCost: number;
  user: User;
};

/**
 * Lets other modules act on stock changes without the catalog depending on them
 * (Finance records a delivery's cost as an expense).
 */
@Injectable()
export class InventoryEvents {
  private readonly received: ((e: StockReceived) => Promise<unknown>)[] = [];

  onReceived(listener: (e: StockReceived) => Promise<unknown>) {
    this.received.push(listener);
  }

  async emitReceived(event: StockReceived) {
    for (const listener of this.received) await listener(event);
  }
}
