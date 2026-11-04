/** Sequential customer numbers for the TX-CU-… reference; existing customers by date added. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerNumbers1793723272328 implements MigrationInterface {
  name = 'CustomerNumbers1793723272328';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD "number" SERIAL NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "customers" c SET "number" = o.n FROM (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS n FROM "customers") o WHERE c."id" = o."id"`,
    );
    await queryRunner.query(
      `SELECT setval(pg_get_serial_sequence('customers', 'number'), GREATEST((SELECT MAX("number") FROM "customers"), 1), (SELECT COUNT(*) > 0 FROM "customers"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "UQ_7a34a76424248001dee0027c62e" UNIQUE ("number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "UQ_7a34a76424248001dee0027c62e"`,
    );
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "number"`);
  }
}
