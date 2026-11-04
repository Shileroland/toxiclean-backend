import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Product, StockMovement, Supplier } from '../catalog/catalog.entity.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { InventoryEvents } from '../catalog/inventory-events.js';
import { Customer } from '../customers/customer.entity.js';
import { AccountsService } from './accounts.service.js';
import { ExpensesService } from './expenses.service.js';
import {
  AdminFinanceController,
  SharedInvoicesController,
} from './finance.controller.js';
import {
  AccountEntry,
  Expense,
  ExpensePayment,
  FinanceAccount,
  Income,
  Invoice,
  RecurringExpense,
} from './finance.entity.js';
import { IncomeService } from './income.service.js';
import { InvoicesService } from './invoices.service.js';
import { VendorsService } from './vendors.service.js';

/** Finance: accounts, income, expenses, vendors and invoices. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinanceAccount,
      AccountEntry,
      Income,
      Expense,
      ExpensePayment,
      RecurringExpense,
      Invoice,
      Supplier,
      StockMovement,
      Customer,
      Product,
    ]),
    AuthModule,
    CatalogModule,
  ],
  controllers: [AdminFinanceController, SharedInvoicesController],
  providers: [
    AccountsService,
    IncomeService,
    ExpensesService,
    VendorsService,
    InvoicesService,
  ],
  exports: [AccountsService, IncomeService, InvoicesService],
})
export class FinanceModule implements OnModuleInit {
  constructor(
    private readonly events: InventoryEvents,
    private readonly expenses: ExpensesService,
  ) {}

  onModuleInit() {
    // A stock delivery's cost is an unpaid Inventory Purchase expense.
    this.events.onReceived((e) => this.expenses.fromStockReceipt(e));
  }
}
