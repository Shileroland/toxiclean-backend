import { MigrationInterface, QueryRunner } from 'typeorm';

/** Customer testimonials managed in the admin and shown on the website. */
export class Testimonials1795518648137 implements MigrationInterface {
  name = 'Testimonials1795518648137';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "testimonials" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "authorName" character varying(100) NOT NULL, "authorRole" character varying(150) NOT NULL DEFAULT '', "authorRoleFr" character varying(150), "location" character varying(100) NOT NULL DEFAULT '', "segment" character varying(20) NOT NULL, "quote" text NOT NULL, "quoteFr" text NOT NULL DEFAULT '', "photo" jsonb, "published" boolean NOT NULL DEFAULT false, "position" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_63b03c608bd258f115a0a4a1060" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6a19523f317460bb97b4a9cc45" ON "testimonials" ("position") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6a19523f317460bb97b4a9cc45"`,
    );
    await queryRunner.query(`DROP TABLE "testimonials"`);
  }
}
