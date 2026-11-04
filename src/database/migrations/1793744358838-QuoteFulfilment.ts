/** How a bulk quotation's products reach the customer (delivery address or pickup). */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteFulfilment1793744358838 implements MigrationInterface {
  name = 'QuoteFulfilment1793744358838';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "proformas" ADD "fulfilment" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "proformas" DROP COLUMN "fulfilment"`);
  }
}
