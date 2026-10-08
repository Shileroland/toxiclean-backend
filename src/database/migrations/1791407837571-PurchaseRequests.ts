/** Purchase request workflow: payments, contact log, internal notes, agreed prices. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class PurchaseRequests1791407837571 implements MigrationInterface {
  name = 'PurchaseRequests1791407837571';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "purchase_request_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" bigint NOT NULL, "method" character varying(20) NOT NULL, "paidOn" date NOT NULL, "account" character varying(120) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "requestId" integer, "recordedById" uuid, CONSTRAINT "PK_5b4d8c3b051ee82a9a6e9f3b044" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1b3c9dde38545655cad7b161e6" ON "purchase_request_payments"  ("requestId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "purchase_request_contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "method" character varying(20) NOT NULL, "contactedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "note" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "requestId" integer, "loggedById" uuid, CONSTRAINT "PK_894601a0a988b5cfd9d33b343f8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1fe3709e7b61e50d655de4dbdd" ON "purchase_request_contacts"  ("requestId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "purchase_request_notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "body" text NOT NULL, "authorName" character varying(200) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "requestId" integer, "authorId" uuid, CONSTRAINT "PK_a549f6960600ecb584b24f411d5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a000639aaa807e127aa9feef74" ON "purchase_request_notes"  ("requestId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD "confirmedTotal" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD "declineReason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_payments" ADD CONSTRAINT "FK_1b3c9dde38545655cad7b161e6d" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_payments" ADD CONSTRAINT "FK_b43808b3704469671aae14478b6" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_contacts" ADD CONSTRAINT "FK_1fe3709e7b61e50d655de4dbdd8" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_contacts" ADD CONSTRAINT "FK_af336c9830c3dc303ce1bb70ec7" FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_notes" ADD CONSTRAINT "FK_a000639aaa807e127aa9feef74d" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_notes" ADD CONSTRAINT "FK_9b14a4b32b60eec923f8dd2129a" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // The old "ready" status is now "ready_for_pickup" (deliveries use "dispatched").
    await queryRunner.query(
      `UPDATE "quote_requests" SET "status" = 'ready_for_pickup' WHERE "status" = 'ready'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "quote_requests" SET "status" = 'ready' WHERE "status" IN ('ready_for_pickup', 'dispatched')`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_notes" DROP CONSTRAINT "FK_9b14a4b32b60eec923f8dd2129a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_notes" DROP CONSTRAINT "FK_a000639aaa807e127aa9feef74d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_contacts" DROP CONSTRAINT "FK_af336c9830c3dc303ce1bb70ec7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_contacts" DROP CONSTRAINT "FK_1fe3709e7b61e50d655de4dbdd8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_payments" DROP CONSTRAINT "FK_b43808b3704469671aae14478b6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_request_payments" DROP CONSTRAINT "FK_1b3c9dde38545655cad7b161e6d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP COLUMN "declineReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_requests" DROP COLUMN "confirmedTotal"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a000639aaa807e127aa9feef74"`,
    );
    await queryRunner.query(`DROP TABLE "purchase_request_notes"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1fe3709e7b61e50d655de4dbdd"`,
    );
    await queryRunner.query(`DROP TABLE "purchase_request_contacts"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1b3c9dde38545655cad7b161e6"`,
    );
    await queryRunner.query(`DROP TABLE "purchase_request_payments"`);
  }
}
