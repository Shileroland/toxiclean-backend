/** Leads (website enquiries being followed up) and their contact log; opens leads for waiting enquiries. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Leads1793730113884 implements MigrationInterface {
  name = 'Leads1793730113884';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "leads" ("id" SERIAL NOT NULL, "reference" character varying(20), "source" character varying(20) NOT NULL, "country" character varying(2) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'new', "survey" jsonb, "lostReason" character varying(40), "lostNote" text, "closedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "bookingId" integer, "quoteRequestId" integer, "assignedToId" uuid, CONSTRAINT "UQ_fc8fd472470762482f5e5eeebf4" UNIQUE ("reference"), CONSTRAINT "REL_42b51122956bcec3e647e8f33f" UNIQUE ("bookingId"), CONSTRAINT "REL_c004e2b3e0e0377cbe8d4d2878" UNIQUE ("quoteRequestId"), CONSTRAINT "PK_cd102ed7a9a4ca7d4d8bfeba406" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "lead_contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "method" character varying(20) NOT NULL, "outcome" character varying(30) NOT NULL, "contactedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "note" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "leadId" integer, "loggedById" uuid, CONSTRAINT "PK_dcbc274112e03d83ed9020c70b1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb1c55a62e20d9a99cc09d4958" ON "lead_contacts"  ("leadId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ADD CONSTRAINT "FK_42b51122956bcec3e647e8f33fd" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ADD CONSTRAINT "FK_c004e2b3e0e0377cbe8d4d2878b" FOREIGN KEY ("quoteRequestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" ADD CONSTRAINT "FK_533da3a3887638192a5dfa2c176" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_contacts" ADD CONSTRAINT "FK_bb1c55a62e20d9a99cc09d49585" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_contacts" ADD CONSTRAINT "FK_09765ef94a2290c9ce134c6a3bb" FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // Website requests and bulk quotes nobody has picked up yet become new leads.
    await queryRunner.query(
      `INSERT INTO "leads" ("source", "country", "bookingId", "createdAt") SELECT 'service_booking', "country", "id", "createdAt" FROM "bookings" WHERE "status" = 'requested' ORDER BY "createdAt"`,
    );
    await queryRunner.query(
      `INSERT INTO "leads" ("source", "country", "quoteRequestId", "createdAt") SELECT 'bulk_quote', "country", "id", "createdAt" FROM "quote_requests" WHERE "kind" = 'bulk' AND "status" = 'requested' ORDER BY "createdAt"`,
    );
    await queryRunner.query(
      `UPDATE "leads" SET "reference" = 'TX-LD-' || lpad("id"::text, 6, '0') WHERE "reference" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lead_contacts" DROP CONSTRAINT "FK_09765ef94a2290c9ce134c6a3bb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lead_contacts" DROP CONSTRAINT "FK_bb1c55a62e20d9a99cc09d49585"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" DROP CONSTRAINT "FK_533da3a3887638192a5dfa2c176"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" DROP CONSTRAINT "FK_c004e2b3e0e0377cbe8d4d2878b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leads" DROP CONSTRAINT "FK_42b51122956bcec3e647e8f33fd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bb1c55a62e20d9a99cc09d4958"`,
    );
    await queryRunner.query(`DROP TABLE "lead_contacts"`);
    await queryRunner.query(`DROP TABLE "leads"`);
  }
}
