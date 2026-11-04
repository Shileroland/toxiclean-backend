import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The shop reads the admin catalog: French product text and "Suitable For" audiences.
 * Invoices (and purchase requests, which feed them) record their language.
 */
export class ShopCatalogAutoInvoices1793808034448 implements MigrationInterface {
  name = 'ShopCatalogAutoInvoices1793808034448';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD "language" character varying(2) NOT NULL DEFAULT 'en'`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "nameFr" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "descriptionFr" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "audiences" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD "language" character varying(2) NOT NULL DEFAULT 'en'`,
    );
    // Benin is French-speaking.
    await queryRunner.query(
      `UPDATE "invoices" SET "language" = 'fr' WHERE "country" = 'BJ'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "language"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "audiences"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "descriptionFr"`,
    );
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "nameFr"`);
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP COLUMN "language"`,
    );
  }
}
