/** Proformas (quotations) prepared for leads, with their charges and totals. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Proformas1793735030406 implements MigrationInterface {
  name = 'Proformas1793735030406';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "proformas" ("id" SERIAL NOT NULL, "reference" character varying(30) NOT NULL, "revision" integer NOT NULL DEFAULT '1', "status" character varying(20) NOT NULL DEFAULT 'draft', "country" character varying(2) NOT NULL, "currency" character varying(3) NOT NULL, "language" character varying(2) NOT NULL DEFAULT 'en', "customer" jsonb NOT NULL, "serviceAddress" character varying(300) NOT NULL, "treatment" jsonb NOT NULL, "lines" jsonb NOT NULL, "discountPercent" numeric(5,2) NOT NULL, "taxPercent" numeric(5,2) NOT NULL, "depositPercent" numeric(5,2) NOT NULL, "paymentTerms" text, "validUntil" date, "servicePlan" jsonb, "subtotal" bigint NOT NULL, "discountAmount" bigint NOT NULL, "taxAmount" bigint NOT NULL, "total" bigint NOT NULL, "depositAmount" bigint NOT NULL, "shareToken" character varying(64), "generatedAt" TIMESTAMP WITH TIME ZONE, "sentAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "leadId" integer, "createdById" uuid, CONSTRAINT "UQ_42fc8c8296318a6fe9573ff725d" UNIQUE ("shareToken"), CONSTRAINT "PK_b79c62b9ae44960defadcacdcba" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3370bd722c2c54658f240cf492" ON "proformas"  ("leadId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f1b81c3a202fbd3378e60c1d90" ON "proformas"  ("reference", "revision") `,
    );
    await queryRunner.query(
      `ALTER TABLE "proformas" ADD CONSTRAINT "FK_3370bd722c2c54658f240cf4928" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "proformas" ADD CONSTRAINT "FK_75d823a5f5870bcc6d043b6e86c" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "proformas" DROP CONSTRAINT "FK_75d823a5f5870bcc6d043b6e86c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "proformas" DROP CONSTRAINT "FK_3370bd722c2c54658f240cf4928"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f1b81c3a202fbd3378e60c1d90"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3370bd722c2c54658f240cf492"`,
    );
    await queryRunner.query(`DROP TABLE "proformas"`);
  }
}
