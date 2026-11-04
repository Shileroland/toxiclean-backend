/** Finance: accounts and their entries, income, expenses (payments, recurring), invoices. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Finance1793783857281 implements MigrationInterface {
  name = 'Finance1793783857281';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "finance_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(120) NOT NULL, "type" character varying(10) NOT NULL, "country" character varying(2) NOT NULL, "branch" character varying(60) NOT NULL, "bankName" character varying(120), "accountNumber" character varying(30), "accountHolder" character varying(200), "openingBalance" bigint NOT NULL DEFAULT '0', "openingDate" date NOT NULL, "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_312bd8aacefb9f1a9163d4b4fe7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "account_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" SERIAL NOT NULL, "kind" character varying(20) NOT NULL, "amount" bigint NOT NULL, "date" date NOT NULL, "reference" character varying(30) NOT NULL, "description" character varying(300) NOT NULL, "reason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "accountId" uuid NOT NULL, "incomeId" uuid, "expensePaymentId" uuid, "counterpartId" uuid, "recordedById" uuid, CONSTRAINT "PK_4378c8454b064f22303906c5da4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2ff4567cfedea790f48a0cdb8c" ON "account_entries"  ("accountId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "incomes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" SERIAL NOT NULL, "reference" character varying(30), "country" character varying(2) NOT NULL, "branch" character varying(60), "source" character varying(20) NOT NULL, "receivedFrom" character varying(200) NOT NULL, "description" character varying(300) NOT NULL DEFAULT '', "amount" bigint NOT NULL, "date" date NOT NULL, "method" character varying(20) NOT NULL, "accountName" character varying(120), "paymentReference" character varying(100), "sourcePayment" character varying(60), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "accountId" uuid, "invoiceId" uuid, "quoteRequestId" integer, "proformaId" integer, "recordedById" uuid, CONSTRAINT "PK_d737b3d0314c1f0da5461a55e5e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c21259c1519d8fa482b9126f40" ON "incomes"  ("reference") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8b40eb796a4a64e30b37b7e9b9" ON "incomes"  ("sourcePayment") `,
    );
    await queryRunner.query(
      `CREATE TABLE "recurring_expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "frequency" character varying(20) NOT NULL, "amount" bigint NOT NULL, "startDate" date NOT NULL, "endDate" date, "nextDate" date NOT NULL, "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_592b47923f3bdb6035439182e66" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" SERIAL NOT NULL, "reference" character varying(30), "country" character varying(2) NOT NULL, "branch" character varying(60) NOT NULL, "description" character varying(200) NOT NULL, "category" character varying(30) NOT NULL, "amount" bigint NOT NULL, "date" date NOT NULL, "document" jsonb, "origin" character varying(20) NOT NULL DEFAULT 'manual', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "supplierId" uuid, "stockMovementId" uuid, "recurringId" uuid, "recordedById" uuid, CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d4c60335172bde8efd4697ac1d" ON "expenses"  ("reference") `,
    );
    await queryRunner.query(
      `CREATE TABLE "expense_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" bigint NOT NULL, "date" date NOT NULL, "method" character varying(20) NOT NULL, "reference" character varying(100), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expenseId" uuid NOT NULL, "accountId" uuid, "recordedById" uuid, CONSTRAINT "PK_7cf2ee63bae4c852652405ad292" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_34f8d735e63d4666142059af29" ON "expense_payments"  ("expenseId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" SERIAL NOT NULL, "reference" character varying(30), "country" character varying(2) NOT NULL, "branch" character varying(60) NOT NULL, "customerName" character varying(200) NOT NULL, "customerEmail" character varying(254), "customerPhone" character varying(20), "billingAddress" character varying(300) NOT NULL DEFAULT '', "issueDate" date NOT NULL, "dueDate" date NOT NULL, "billingReference" character varying(100), "items" jsonb NOT NULL, "subtotal" bigint NOT NULL, "taxRate" numeric(5,2) NOT NULL, "tax" bigint NOT NULL, "total" bigint NOT NULL, "source" character varying(20) NOT NULL DEFAULT 'manual', "sentAt" TIMESTAMP WITH TIME ZONE, "shareToken" character varying(64) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customerId" uuid, "bookingId" integer, "quoteRequestId" integer, "proformaId" integer, "recordedById" uuid, CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d55c1c55e7737a5a7ec5220692" ON "invoices"  ("reference") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cdfe7215b223c6264336b50b96" ON "invoices"  ("shareToken") `,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" ADD CONSTRAINT "FK_2ff4567cfedea790f48a0cdb8c7" FOREIGN KEY ("accountId") REFERENCES "finance_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" ADD CONSTRAINT "FK_64a3a9d5131b34c284a3da51436" FOREIGN KEY ("incomeId") REFERENCES "incomes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" ADD CONSTRAINT "FK_da64b2943a2408fe0c7a53f928a" FOREIGN KEY ("expensePaymentId") REFERENCES "expense_payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" ADD CONSTRAINT "FK_ecb4a7b611ca1e61d554de3c1f3" FOREIGN KEY ("counterpartId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" ADD CONSTRAINT "FK_5089686aadb611ae728c8e92510" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" ADD CONSTRAINT "FK_bce0697ddfa691a90d08d12902b" FOREIGN KEY ("accountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" ADD CONSTRAINT "FK_d017b6aa860872db2563ac4e5ca" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" ADD CONSTRAINT "FK_7df8fe5bc851647201cbb93d4cf" FOREIGN KEY ("quoteRequestId") REFERENCES "quote_requests"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" ADD CONSTRAINT "FK_981b6048b78e43d4adc7e2c6c80" FOREIGN KEY ("proformaId") REFERENCES "proformas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" ADD CONSTRAINT "FK_8f862f2a9e3577bd2361ed2cc6d" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_cb04770a68c157a22fa42cc0506" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_c148fe9d19c26adf0c6383a5d25" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_61845f2845766024ab0003b8153" FOREIGN KEY ("recurringId") REFERENCES "recurring_expenses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_a843f65cdc3a9a88f1840a5ace9" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_payments" ADD CONSTRAINT "FK_34f8d735e63d4666142059af296" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_payments" ADD CONSTRAINT "FK_eb1ff117b4fa9009876dc388177" FOREIGN KEY ("accountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_payments" ADD CONSTRAINT "FK_ded7d133504dbde8bbba79091ac" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_1df049f8943c6be0c1115541efb" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_eca01fda44679cc1c342822e01b" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_c1561f203a6c6f6624dde6fbbc5" FOREIGN KEY ("quoteRequestId") REFERENCES "quote_requests"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_5c0c177a1cfba149db8107bf04e" FOREIGN KEY ("proformaId") REFERENCES "proformas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_3c6ffbd19c59e0ee3e792629274" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_3c6ffbd19c59e0ee3e792629274"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_5c0c177a1cfba149db8107bf04e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_c1561f203a6c6f6624dde6fbbc5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_eca01fda44679cc1c342822e01b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_1df049f8943c6be0c1115541efb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_payments" DROP CONSTRAINT "FK_ded7d133504dbde8bbba79091ac"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_payments" DROP CONSTRAINT "FK_eb1ff117b4fa9009876dc388177"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_payments" DROP CONSTRAINT "FK_34f8d735e63d4666142059af296"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_a843f65cdc3a9a88f1840a5ace9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_61845f2845766024ab0003b8153"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_c148fe9d19c26adf0c6383a5d25"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_cb04770a68c157a22fa42cc0506"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" DROP CONSTRAINT "FK_8f862f2a9e3577bd2361ed2cc6d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" DROP CONSTRAINT "FK_981b6048b78e43d4adc7e2c6c80"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" DROP CONSTRAINT "FK_7df8fe5bc851647201cbb93d4cf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" DROP CONSTRAINT "FK_d017b6aa860872db2563ac4e5ca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "incomes" DROP CONSTRAINT "FK_bce0697ddfa691a90d08d12902b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" DROP CONSTRAINT "FK_5089686aadb611ae728c8e92510"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" DROP CONSTRAINT "FK_ecb4a7b611ca1e61d554de3c1f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" DROP CONSTRAINT "FK_da64b2943a2408fe0c7a53f928a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" DROP CONSTRAINT "FK_64a3a9d5131b34c284a3da51436"`,
    );
    await queryRunner.query(
      `ALTER TABLE "account_entries" DROP CONSTRAINT "FK_2ff4567cfedea790f48a0cdb8c7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cdfe7215b223c6264336b50b96"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d55c1c55e7737a5a7ec5220692"`,
    );
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_34f8d735e63d4666142059af29"`,
    );
    await queryRunner.query(`DROP TABLE "expense_payments"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d4c60335172bde8efd4697ac1d"`,
    );
    await queryRunner.query(`DROP TABLE "expenses"`);
    await queryRunner.query(`DROP TABLE "recurring_expenses"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8b40eb796a4a64e30b37b7e9b9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c21259c1519d8fa482b9126f40"`,
    );
    await queryRunner.query(`DROP TABLE "incomes"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2ff4567cfedea790f48a0cdb8c"`,
    );
    await queryRunner.query(`DROP TABLE "account_entries"`);
    await queryRunner.query(`DROP TABLE "finance_accounts"`);
  }
}
