/** Customer responses on proformas, and deposit payments against accepted ones. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProformaResponses1793742147601 implements MigrationInterface {
  name = 'ProformaResponses1793742147601';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "proforma_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" bigint NOT NULL, "method" character varying(20) NOT NULL, "paidOn" date NOT NULL, "account" character varying(120) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "proformaId" integer, "recordedById" uuid, CONSTRAINT "PK_50b5db80cdb3076c84a4568b4f1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9f19f2625bbd9cf1c23d396632" ON "proforma_payments"  ("proformaId") `,
    );
    await queryRunner.query(`ALTER TABLE "proformas" ADD "responseDate" date`);
    await queryRunner.query(`ALTER TABLE "proformas" ADD "responseNote" text`);
    await queryRunner.query(
      `ALTER TABLE "proforma_payments" ADD CONSTRAINT "FK_9f19f2625bbd9cf1c23d3966326" FOREIGN KEY ("proformaId") REFERENCES "proformas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "proforma_payments" ADD CONSTRAINT "FK_2cd0da01e25c95423f3acfaaecb" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "proforma_payments" DROP CONSTRAINT "FK_2cd0da01e25c95423f3acfaaecb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "proforma_payments" DROP CONSTRAINT "FK_9f19f2625bbd9cf1c23d3966326"`,
    );
    await queryRunner.query(
      `ALTER TABLE "proformas" DROP COLUMN "responseNote"`,
    );
    await queryRunner.query(
      `ALTER TABLE "proformas" DROP COLUMN "responseDate"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9f19f2625bbd9cf1c23d396632"`,
    );
    await queryRunner.query(`DROP TABLE "proforma_payments"`);
  }
}
