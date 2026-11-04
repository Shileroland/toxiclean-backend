import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { countryParam } from '../admin/admin.controller.js';
import { AdminGuard, CurrentUser } from '../auth/session.guard.js';
import { MAX_PHOTO_BYTES } from '../bookings/photo-storage.js';
import type { User } from '../users/user.entity.js';
import {
  AdjustStockDto,
  BrandDto,
  MAX_PRODUCT_IMAGES,
  ProductDto,
  ReceiveStockDto,
  ReorderLevelDto,
  SupplierDto,
} from './catalog.dto.js';
import {
  MOVEMENT_TYPES,
  PRODUCT_CATEGORIES,
  type MovementType,
  type ProductCategory,
  type StoredFile,
} from './catalog.entity.js';
import {
  AGREEMENT_STATUSES,
  type AgreementStatus,
  CatalogService,
} from './catalog.service.js';
import {
  InventoryService,
  STOCK_STATUSES,
  type StockStatus,
} from './inventory.service.js';

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (v: string): v is T =>
    (list as readonly string[]).includes(v);
const listParam = <T extends string>(
  value: string | undefined,
  list: readonly T[],
) => (value ?? '').split(',').filter(oneOf(list));
const pageParam = (page?: string) =>
  Math.max(1, Math.min(10_000, Number.parseInt(page ?? '1', 10) || 1));
const search = (q?: string) => q?.trim().slice(0, 100) || undefined;

const oneFile = (field: string) =>
  FileInterceptor(field, {
    storage: memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 20 },
  });

const inline = (file: StoredFile, stream: NodeJS.ReadableStream) =>
  new StreamableFile(stream as never, {
    type: file.mimeType,
    length: file.size,
    disposition: 'inline',
  });

@Controller('admin/brands')
@UseGuards(AdminGuard)
export class AdminBrandsController {
  constructor(private readonly catalog: CatalogService) {}

  /** ?q=…&country=NG,BJ&status=active,expiring&page=1 */
  @Get('list')
  list(
    @Query('q') q?: string,
    @Query('country') country?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.catalog.brandPage({
      q: search(q),
      countries: listParam(country, ['NG', 'BJ'] as const),
      statuses: listParam<AgreementStatus>(status, AGREEMENT_STATUSES),
      page: pageParam(page),
    });
  }

  @Get('options')
  options() {
    return this.catalog.brandOptions();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.brandDetails(id);
  }

  /** Multipart: the brand fields and an optional agreement `document`. */
  @Post()
  @UseInterceptors(oneFile('document'))
  create(
    @Body() dto: BrandDto,
    @UploadedFile() document?: Express.Multer.File,
  ) {
    return this.catalog.createBrand(dto, document);
  }

  @Patch(':id')
  @UseInterceptors(oneFile('document'))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BrandDto,
    @UploadedFile() document?: Express.Multer.File,
  ) {
    return this.catalog.updateBrand(id, dto, document, dto.removeDocument);
  }

  @Get(':id/document')
  async document(@Param('id', ParseUUIDPipe) id: string) {
    const { file, stream } = await this.catalog.openBrandDocument(id);
    return inline(file, stream);
  }
}

@Controller('admin/products')
@UseGuards(AdminGuard)
export class AdminProductsController {
  constructor(private readonly catalog: CatalogService) {}

  /** ?country=NG&location=Ikeja Branch&q=…&category=chemicals&page=1 */
  @Get('list')
  list(
    @Query('country') country?: string,
    @Query('location') location?: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
  ) {
    return this.catalog.productPage({
      country: countryParam(country),
      location: location || undefined,
      q: search(q),
      categories: listParam<ProductCategory>(category, PRODUCT_CATEGORIES),
      page: pageParam(page),
    });
  }

  /** Every product (id, name, SKU, category), optionally one category. */
  @Get('options')
  options(@Query('category') category?: string) {
    return this.catalog.productOptions(
      category && oneOf(PRODUCT_CATEGORIES)(category) ? category : undefined,
    );
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('country') country?: string,
  ) {
    return this.catalog.productDetails(id, countryParam(country));
  }

  @Post()
  create(@Body() dto: ProductDto, @Query('country') country?: string) {
    return this.catalog.createProduct(dto, countryParam(country));
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductDto,
    @Query('country') country?: string,
  ) {
    return this.catalog.updateProduct(id, dto, countryParam(country));
  }

  /** Multipart `images` (PNG/JPG), added after the existing ones. */
  @Post(':id/images')
  @UseInterceptors(
    FilesInterceptor('images', MAX_PRODUCT_IMAGES, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PRODUCT_IMAGES },
    }),
  )
  addImages(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Query('country') country?: string,
  ) {
    return this.catalog.addImages(id, files, countryParam(country));
  }

  @Delete(':id/images/:index')
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Query('country') country?: string,
  ) {
    return this.catalog.removeImage(id, index, countryParam(country));
  }

  @Post(':id/images/:index/primary')
  @HttpCode(200)
  setPrimary(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Query('country') country?: string,
  ) {
    return this.catalog.setPrimaryImage(id, index, countryParam(country));
  }

  @Post(':id/safety-data-sheet')
  @HttpCode(200)
  @UseInterceptors(oneFile('document'))
  setSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() document: Express.Multer.File,
    @Query('country') country?: string,
  ) {
    return this.catalog.setSafetyDataSheet(id, document, countryParam(country));
  }

  @Delete(':id/safety-data-sheet')
  removeSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('country') country?: string,
  ) {
    return this.catalog.removeSafetyDataSheet(id, countryParam(country));
  }

  @Get(':id/safety-data-sheet')
  async sheet(@Param('id', ParseUUIDPipe) id: string) {
    const { file, stream } = await this.catalog.openSafetyDataSheet(id);
    return inline(file, stream);
  }
}

@Controller('admin/inventory')
@UseGuards(AdminGuard)
export class AdminInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** ?country=NG&location=…&q=…&status=low_stock,out_of_stock&page=1 */
  @Get('list')
  list(
    @Query('country') country?: string,
    @Query('location') location?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.inventory.page({
      country: countryParam(country),
      location: location || undefined,
      q: search(q),
      statuses: listParam<StockStatus>(status, STOCK_STATUSES),
      page: pageParam(page),
    });
  }

  @Get('suppliers')
  suppliers(@Query('country') country?: string) {
    return this.inventory.listSuppliers(countryParam(country));
  }

  @Post('suppliers')
  createSupplier(@Body() dto: SupplierDto) {
    return this.inventory.createSupplier(dto);
  }

  @Post('receive')
  receive(@Body() dto: ReceiveStockDto, @CurrentUser() user: User) {
    return this.inventory.receive(dto, user);
  }

  @Get(':productId')
  async details(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('country') country?: string,
    @Query('location') location?: string,
  ) {
    const { product: p, ...rest } = await this.inventory.details(
      productId,
      countryParam(country),
      location || undefined,
    );
    return {
      product: {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        brand: p.brand?.name ?? (p.unbranded ? 'Unbranded' : null),
        images: p.images.map((i) => i.fileName),
      },
      ...rest,
    };
  }

  /** Stock Movement History: ?country&location&type=received,issued&q=GR-…&page */
  @Get(':productId/movements')
  movements(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('country') country?: string,
    @Query('location') location?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    return this.inventory.movementPage({
      productId,
      country: countryParam(country),
      location: location || undefined,
      types: listParam<MovementType>(type, MOVEMENT_TYPES),
      q: search(q),
      page: pageParam(page),
    });
  }

  @Post(':productId/adjust')
  adjust(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: User,
  ) {
    return this.inventory.adjust(productId, dto, user);
  }

  @Put(':productId/reorder-level')
  @HttpCode(204)
  reorderLevel(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ReorderLevelDto,
  ) {
    return this.inventory.setReorderLevel(productId, dto);
  }
}

/** Public: the shop's catalog and product images (random names). */
@Controller('products')
export class ShopProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list() {
    return this.catalog.shopProducts();
  }

  @Get('images/:fileName')
  @Header('Cache-Control', 'public, max-age=86400')
  async image(@Param('fileName') fileName: string) {
    const { file, stream } = await this.catalog.openImage(
      /^[\w-]+\.(png|jpg)$/.test(fileName) ? fileName : 'invalid',
    );
    return inline(file, stream);
  }
}
