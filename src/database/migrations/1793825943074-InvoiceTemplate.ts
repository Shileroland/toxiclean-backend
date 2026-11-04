import { MigrationInterface, QueryRunner } from 'typeorm';

/** Invoices follow the company template: "Attn", Terms & Notes and a delivery line. */
export class InvoiceTemplate1793825943074 implements MigrationInterface {
  name = 'InvoiceTemplate1793825943074';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD "attention" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD "notes" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD "deliveryInvoicedSeparately" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN "deliveryInvoicedSeparately"`,
    );
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "notes"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "attention"`);
  }
}
