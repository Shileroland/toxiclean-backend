import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { countryParam } from '../admin/admin.controller.js';
import { AdminGuard, CurrentUser } from '../auth/session.guard.js';
import { MAX_PHOTO_BYTES } from '../bookings/photo-storage.js';
import type { User } from '../users/user.entity.js';
import { AccountsService } from './accounts.service.js';
import {
  EXPENSE_STATUSES,
  type ExpenseStatus,
  ExpensesService,
} from './expenses.service.js';
import {
  AccountDto,
  AdjustBalanceDto,
  ExpenseDto,
  ExpensePaymentDto,
  IncomeDto,
  InvoiceDto,
  InvoiceNotesDto,
  InvoicePaymentDto,
  TransferDto,
  UpdateAccountDto,
  UpdateRecurrenceDto,
  VendorDto,
} from './finance.dto.js';
import {
  ACCOUNT_TYPES,
  type AccountType,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  INCOME_SOURCES,
  type IncomeSource,
  PAYMENT_METHODS,
  type PaymentMethod,
} from './finance.entity.js';
import { IncomeService } from './income.service.js';
import {
  INVOICE_STATUSES,
  type InvoiceStatus,
  InvoicesService,
} from './invoices.service.js';
import { isPeriod } from './periods.js';
import { VendorsService } from './vendors.service.js';

const listParam = <T extends string>(
  value: string | undefined,
  list: readonly T[],
) =>
  (value ?? '')
    .split(',')
    .filter((v): v is T => (list as readonly string[]).includes(v));
const pageParam = (page?: string) =>
  Math.max(1, Math.min(10_000, Number.parseInt(page ?? '1', 10) || 1));
const search = (q?: string) => q?.trim().slice(0, 100) || undefined;
const periodParam = (p?: string) => (p && isPeriod(p) ? p : 'this_month');
const STATUSES = ['active', 'inactive'] as const;

@Controller('admin/finance')
@UseGuards(AdminGuard)
export class AdminFinanceController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly income: IncomeService,
    private readonly expenses: ExpensesService,
    private readonly vendors: VendorsService,
    private readonly invoices: InvoicesService,
  ) {}

  // ---- Accounts ----

  @Get('accounts')
  accountPage(
    @Query('country') country?: string,
    @Query('branch') branch?: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.accounts.page({
      country: countryParam(country),
      branch: branch || undefined,
      q: search(q),
      types: listParam<AccountType>(type, ACCOUNT_TYPES),
      statuses: listParam(status, STATUSES),
      page: pageParam(page),
    });
  }

  @Get('accounts/options')
  accountOptions(@Query('country') country?: string) {
    return this.accounts.options(countryParam(country));
  }

  @Post('accounts')
  createAccount(@Body() dto: AccountDto) {
    return this.accounts.create(dto);
  }

  @Post('transfers')
  transfer(@Body() dto: TransferDto, @CurrentUser() user: User) {
    return this.accounts.transfer(dto, user);
  }

  @Get('accounts/:id')
  account(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('period') period?: string,
  ) {
    return this.accounts.details(id, periodParam(period));
  }

  @Put('accounts/:id')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(id, dto);
  }

  @Post('accounts/:id/adjust')
  @HttpCode(200)
  adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustBalanceDto,
    @CurrentUser() user: User,
  ) {
    return this.accounts.adjust(id, dto, user);
  }

  /** Transaction History: ?period&q&direction=in,out&page */
  @Get('accounts/:id/entries')
  entries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('period') period?: string,
    @Query('q') q?: string,
    @Query('direction') direction?: string,
    @Query('page') page?: string,
  ) {
    return this.accounts.entryPage({
      id,
      period: periodParam(period),
      q: search(q),
      directions: listParam(direction, ['in', 'out'] as const),
      page: pageParam(page),
    });
  }

  // ---- Income ----

  @Get('income')
  incomePage(
    @Query('country') country?: string,
    @Query('period') period?: string,
    @Query('branch') branch?: string,
    @Query('q') q?: string,
    @Query('source') source?: string,
    @Query('method') method?: string,
    @Query('page') page?: string,
  ) {
    return this.income.page({
      country: countryParam(country),
      period: periodParam(period),
      branch: branch || undefined,
      q: search(q),
      sources: listParam<IncomeSource>(source, INCOME_SOURCES),
      methods: listParam<PaymentMethod>(method, PAYMENT_METHODS),
      page: pageParam(page),
    });
  }

  @Post('income')
  recordIncome(@Body() dto: IncomeDto, @CurrentUser() user: User) {
    return this.income.create(dto, user);
  }

  @Get('income/:id')
  incomeDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.income.details(id);
  }

  // ---- Expenses ----

  @Get('expenses')
  expensePage(
    @Query('country') country?: string,
    @Query('period') period?: string,
    @Query('branch') branch?: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.expenses.page({
      country: countryParam(country),
      period: periodParam(period),
      branch: branch || undefined,
      q: search(q),
      categories: listParam<ExpenseCategory>(category, EXPENSE_CATEGORIES),
      statuses: listParam<ExpenseStatus>(status, EXPENSE_STATUSES),
      page: pageParam(page),
    });
  }

  @Post('expenses')
  recordExpense(@Body() dto: ExpenseDto, @CurrentUser() user: User) {
    return this.expenses.create(dto, user);
  }

  @Get('expenses/:id')
  expense(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.details(id);
  }

  @Post('expenses/:id/payments')
  @HttpCode(200)
  payExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpensePaymentDto,
    @CurrentUser() user: User,
  ) {
    return this.expenses.recordPayment(id, dto, user);
  }

  @Put('expenses/:id/recurrence')
  updateRecurrence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurrenceDto,
  ) {
    return this.expenses.updateRecurrence(id, dto);
  }

  @Post('expenses/:id/recurrence/stop')
  @HttpCode(200)
  stopRecurrence(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenses.stopRecurrence(id);
  }

  /** Multipart `document`: the receipt or invoice (PDF, PNG or JPG). */
  @Post('expenses/:id/document')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('document', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  expenseDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() document: Express.Multer.File,
  ) {
    return this.expenses.setDocument(id, document);
  }

  @Get('expenses/:id/document')
  async openExpenseDocument(@Param('id', ParseUUIDPipe) id: string) {
    const { file, stream } = await this.expenses.openDocument(id);
    return new StreamableFile(stream, {
      type: file.mimeType,
      length: file.size,
      disposition: 'inline',
    });
  }

  // ---- Vendors & Suppliers ----

  @Get('vendors')
  vendorPage(
    @Query('country') country?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.vendors.page({
      country: countryParam(country),
      q: search(q),
      statuses: listParam(status, STATUSES),
      page: pageParam(page),
    });
  }

  @Get('vendors/options')
  vendorOptions(@Query('country') country?: string) {
    return this.vendors.options(countryParam(country));
  }

  @Post('vendors')
  createVendor(@Body() dto: VendorDto) {
    return this.vendors.create(dto);
  }

  @Get('vendors/:id')
  vendor(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendors.details(id);
  }

  @Put('vendors/:id')
  updateVendor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorDto) {
    return this.vendors.update(id, dto);
  }

  // ---- Invoices ----

  @Get('invoices')
  invoicePage(
    @Query('country') country?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('sending') sending?: string,
    @Query('page') page?: string,
  ) {
    return this.invoices.page({
      country: countryParam(country),
      q: search(q),
      statuses: listParam<InvoiceStatus>(status, INVOICE_STATUSES),
      sending: listParam(sending, ['sent', 'not_sent'] as const),
      page: pageParam(page),
    });
  }

  @Get('invoices/defaults')
  invoiceDefaults(@Query('country') country?: string) {
    return this.invoices.defaults(countryParam(country));
  }

  @Post('invoices')
  createInvoice(@Body() dto: InvoiceDto, @CurrentUser() user: User) {
    return this.invoices.create(dto, user);
  }

  @Get('invoices/:id')
  invoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.details(id);
  }

  @Get('invoices/:id/document')
  invoiceDocument(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.documentFor(id);
  }

  @Post('invoices/:id/sent')
  @HttpCode(200)
  markSent(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.markSent(id);
  }

  @Put('invoices/:id/notes')
  invoiceNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoiceNotesDto,
  ) {
    return this.invoices.updateNotes(id, dto);
  }

  @Post('invoices/:id/payments')
  @HttpCode(200)
  payInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoicePaymentDto,
    @CurrentUser() user: User,
  ) {
    return this.invoices.recordPayment(id, dto, user);
  }
}

/** Public: the invoice a customer was sent a link to. */
@Controller('invoices')
@UseGuards(ThrottlerGuard)
export class SharedInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get('shared/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store')
  shared(@Param('token') token: string) {
    return this.invoices.shared(token.slice(0, 64));
  }
}
