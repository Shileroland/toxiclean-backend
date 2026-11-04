import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import {
  AdminBrandsController,
  AdminInventoryController,
  AdminProductsController,
  ShopProductsController,
} from './catalog.controller.js';
import {
  Brand,
  Product,
  StockLevel,
  StockMovement,
  Supplier,
} from './catalog.entity.js';
import { CatalogService } from './catalog.service.js';
import { InventoryEvents } from './inventory-events.js';
import { InventoryService } from './inventory.service.js';

/** Products, brands and stock (admin Products & Inventory, and shop images). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Brand,
      Product,
      StockLevel,
      StockMovement,
      Supplier,
    ]),
    AuthModule,
  ],
  controllers: [
    AdminBrandsController,
    AdminProductsController,
    AdminInventoryController,
    ShopProductsController,
  ],
  providers: [CatalogService, InventoryService, InventoryEvents],
  exports: [CatalogService, InventoryService, InventoryEvents],
})
export class CatalogModule {}
