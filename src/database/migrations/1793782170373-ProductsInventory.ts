/** Products & Inventory: brands, products, suppliers, stock levels and stock movements. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductsInventory1793782170373 implements MigrationInterface {
  name = 'ProductsInventory1793782170373';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "brands" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "countries" jsonb NOT NULL DEFAULT '[]', "agreementStart" date, "agreementExpiry" date, "agreementDocument" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b0c437120b624da1034a81fc561" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_96db6bbbaa6f23cad26871339b" ON "brands"  ("name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(120) NOT NULL, "sku" character varying(40) NOT NULL, "name" character varying(200) NOT NULL, "category" character varying(30) NOT NULL, "unbranded" boolean NOT NULL DEFAULT false, "description" text NOT NULL DEFAULT '', "specifications" jsonb NOT NULL DEFAULT '[]', "images" jsonb NOT NULL DEFAULT '[]', "priceNgn" integer, "priceXof" integer, "rentable" boolean NOT NULL DEFAULT false, "regulatoryAuthority" character varying(100), "registrationNumber" character varying(100), "safetyDataSheet" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "brandId" uuid, CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_464f927ae360106b783ed0b410" ON "products"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c44ac33a05b144dd0d9ddcf932" ON "products"  ("sku") `,
    );
    await queryRunner.query(
      `CREATE TABLE "suppliers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(200) NOT NULL, "country" character varying(2) NOT NULL, "contactPerson" character varying(200), "phone" character varying(20), "email" character varying(254), "address" character varying(300), "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5b5720d9645cee7396595a16c9" ON "suppliers"  ("name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "stock_levels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "country" character varying(2) NOT NULL, "location" character varying(60) NOT NULL, "onHand" integer NOT NULL DEFAULT '0', "reserved" integer NOT NULL DEFAULT '0', "reorderLevel" integer, "productId" uuid NOT NULL, CONSTRAINT "UQ_01bf1b80d1bc0e45ae5d2f6fb95" UNIQUE ("productId", "location"), CONSTRAINT "PK_ee416fdf2f5696dff16fd0c1c90" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "stock_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" SERIAL NOT NULL, "reference" character varying(30) NOT NULL, "type" character varying(20) NOT NULL, "country" character varying(2) NOT NULL, "location" character varying(60) NOT NULL, "quantity" integer NOT NULL, "date" date NOT NULL, "supplierReference" character varying(100), "totalCost" integer, "reason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "productId" uuid NOT NULL, "supplierId" uuid, "quoteRequestId" integer, "recordedById" uuid, CONSTRAINT "PK_57a26b190618550d8e65fb860e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a3acb59db67e977be45e382fc5" ON "stock_movements"  ("productId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_ea86d0c514c4ecbb5694cbf57df" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_levels" ADD CONSTRAINT "FK_875faa3d8407d502b7f123e94f2" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_a3acb59db67e977be45e382fc56" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_577871286eaf395c1fbf1731ece" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_7e2cd9cd82e8a1d6536bfc84964" FOREIGN KEY ("quoteRequestId") REFERENCES "quote_requests"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_13aa3839c2698cf627c9ea9c7d7" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_13aa3839c2698cf627c9ea9c7d7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_7e2cd9cd82e8a1d6536bfc84964"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_577871286eaf395c1fbf1731ece"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_a3acb59db67e977be45e382fc56"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_levels" DROP CONSTRAINT "FK_875faa3d8407d502b7f123e94f2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_ea86d0c514c4ecbb5694cbf57df"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a3acb59db67e977be45e382fc5"`,
    );
    await queryRunner.query(`DROP TABLE "stock_movements"`);
    await queryRunner.query(`DROP TABLE "stock_levels"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5b5720d9645cee7396595a16c9"`,
    );
    await queryRunner.query(`DROP TABLE "suppliers"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c44ac33a05b144dd0d9ddcf932"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_464f927ae360106b783ed0b410"`,
    );
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_96db6bbbaa6f23cad26871339b"`,
    );
    await queryRunner.query(`DROP TABLE "brands"`);
  }
}
