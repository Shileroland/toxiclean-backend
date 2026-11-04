/** Fumigator profiles (contact, branch, skills, availability, hours) and their certificates. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FumigatorProfiles1793745714998 implements MigrationInterface {
  name = 'FumigatorProfiles1793745714998';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "fumigator_certificates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(200) NOT NULL, "issuingOrganisation" character varying(200) NOT NULL, "certificateNumber" character varying(100), "issueDate" date NOT NULL, "expiryDate" date NOT NULL, "document" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fumigatorId" uuid, CONSTRAINT "PK_fe9367df5bccd978ce87fc44fbe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2f924c1bd8e66d9cc514106360" ON "fumigator_certificates"  ("fumigatorId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD "email" character varying(254)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD "branch" character varying(60)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD "region" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD "skills" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD "availability" character varying(20) NOT NULL DEFAULT 'available'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD "workingDays" jsonb NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD "workStart" character varying(5) NOT NULL DEFAULT '08:00'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD "workEnd" character varying(5) NOT NULL DEFAULT '17:00'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigator_certificates" ADD CONSTRAINT "FK_2f924c1bd8e66d9cc5141063605" FOREIGN KEY ("fumigatorId") REFERENCES "fumigators"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fumigator_certificates" DROP CONSTRAINT "FK_2f924c1bd8e66d9cc5141063605"`,
    );
    await queryRunner.query(`ALTER TABLE "fumigators" DROP COLUMN "workEnd"`);
    await queryRunner.query(`ALTER TABLE "fumigators" DROP COLUMN "workStart"`);
    await queryRunner.query(
      `ALTER TABLE "fumigators" DROP COLUMN "workingDays"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" DROP COLUMN "availability"`,
    );
    await queryRunner.query(`ALTER TABLE "fumigators" DROP COLUMN "skills"`);
    await queryRunner.query(`ALTER TABLE "fumigators" DROP COLUMN "region"`);
    await queryRunner.query(`ALTER TABLE "fumigators" DROP COLUMN "branch"`);
    await queryRunner.query(`ALTER TABLE "fumigators" DROP COLUMN "email"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2f924c1bd8e66d9cc514106360"`,
    );
    await queryRunner.query(`DROP TABLE "fumigator_certificates"`);
  }
}
