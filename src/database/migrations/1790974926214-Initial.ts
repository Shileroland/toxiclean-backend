/** The full schema as of launch. Later schema changes get their own migrations. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1790974926214 implements MigrationInterface {
  name = 'Initial1790974926214';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() for primary keys; not enabled on a fresh database.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fullName" character varying(200) NOT NULL, "email" character varying(254) NOT NULL, "phone" character varying(20) NOT NULL, "passwordHash" character varying(255), "role" character varying(20) NOT NULL DEFAULT 'customer', "country" character varying(2), "language" character varying(5) NOT NULL DEFAULT 'en', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "country" character varying(2) NOT NULL, "state" character varying(100) NOT NULL, "city" character varying(100) NOT NULL, "address" character varying(300) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "PK_745d8f43d3af10ab8247465e450" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tokenHash" character(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1143abb8c3fad8b06dd857a8c9" ON "password_reset_tokens"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tokenHash" character(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bace6c68efc156fddac9b14bda" ON "sessions"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "bookings" ("id" SERIAL NOT NULL, "reference" character varying(20), "status" character varying(20) NOT NULL DEFAULT 'requested', "serviceCategory" character varying(100) NOT NULL, "serviceSlug" character varying(100) NOT NULL, "serviceName" character varying(200) NOT NULL, "propertyType" character varying(20) NOT NULL, "issue" text NOT NULL, "photos" jsonb NOT NULL DEFAULT '[]', "fullName" character varying(200) NOT NULL, "phone" character varying(20) NOT NULL, "email" character varying(254) NOT NULL, "preferredContactMethod" character varying(20) NOT NULL, "country" character varying(2) NOT NULL, "state" character varying(100) NOT NULL, "city" character varying(100) NOT NULL, "address" character varying(300) NOT NULL, "preferredDate" date NOT NULL, "preferredTime" character varying(20) NOT NULL, "scheduledDate" date, "scheduledTime" character varying(5), "assignedFumigator" character varying(200), "rescheduleRequest" jsonb, "cancellationRequest" jsonb, "completedAt" TIMESTAMP WITH TIME ZONE, "closedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "UQ_d7eca65f0a4d442ec4491f2f804" UNIQUE ("reference"), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying(20) NOT NULL, "title" character varying(200) NOT NULL, "reference" character varying(30), "issuedOn" date NOT NULL, "fileName" character varying(100) NOT NULL, "storage" character varying(10) NOT NULL DEFAULT 'local', "mimeType" character varying(50) NOT NULL, "size" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e300b5c2e3fefa9d6f8a3f2597" ON "documents"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "quote_requests" ("id" SERIAL NOT NULL, "reference" character varying(20), "kind" character varying(10) NOT NULL DEFAULT 'bulk', "currency" character varying(3) NOT NULL DEFAULT 'NGN', "items" jsonb NOT NULL, "organisationName" character varying(200), "fullName" character varying(200) NOT NULL, "phone" character varying(20) NOT NULL, "email" character varying(254) NOT NULL, "country" character varying(2) NOT NULL, "deliveryMethod" character varying(20) NOT NULL, "state" character varying(100), "city" character varying(100), "address" character varying(300), "tenderReference" character varying(100), "preferredContactMethod" character varying(20) NOT NULL, "notes" text, "status" character varying(20) NOT NULL DEFAULT 'requested', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "UQ_df877aee26b10ba76868d96cc83" UNIQUE ("reference"), CONSTRAINT "PK_c05f72de8be0ec6b0985a851558" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "contact_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fullName" character varying(200) NOT NULL, "phone" character varying(20) NOT NULL, "email" character varying(254) NOT NULL, "country" character varying(2) NOT NULL, "topic" character varying(20) NOT NULL, "preferredContactMethod" character varying(20) NOT NULL, "message" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b74f96eb2edd977ccfba6533293" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" ADD CONSTRAINT "FK_95c93a584de49f0b0e13f753630" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_d6a19d4b4f6c62dcd29daa497e2" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_38a69a58a323647f2e75eb994de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_e300b5c2e3fefa9d6f8a3f25975" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD CONSTRAINT "FK_1ea22edc0dff28ac7d12e446f73" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP CONSTRAINT "FK_1ea22edc0dff28ac7d12e446f73"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_e300b5c2e3fefa9d6f8a3f25975"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_38a69a58a323647f2e75eb994de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_d6a19d4b4f6c62dcd29daa497e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" DROP CONSTRAINT "FK_95c93a584de49f0b0e13f753630"`,
    );
    await queryRunner.query(`DROP TABLE "contact_messages"`);
    await queryRunner.query(`DROP TABLE "quote_requests"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e300b5c2e3fefa9d6f8a3f2597"`,
    );
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bace6c68efc156fddac9b14bda"`,
    );
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1143abb8c3fad8b06dd857a8c9"`,
    );
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP TABLE "addresses"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
