import { MigrationInterface, QueryRunner } from 'typeorm';

/** Admins can hide a product from the public shop; existing products stay visible. */
export class ProductVisibility1793840000000 implements MigrationInterface {
  name = 'ProductVisibility1793840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD "published" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "published"`);
  }
}
