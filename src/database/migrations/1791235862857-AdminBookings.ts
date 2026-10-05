import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminBookings1791235862857 implements MigrationInterface {
  name = 'AdminBookings1791235862857';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying(20) NOT NULL DEFAULT 'individual', "name" character varying(200) NOT NULL, "phone" character varying(20) NOT NULL, "email" character varying(254) NOT NULL, "country" character varying(2) NOT NULL, "preferredContactMethod" character varying(20) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "UQ_8536b8b85c06969f84f0c098b03" UNIQUE ("email"), CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "country" character varying(2) NOT NULL, "state" character varying(100) NOT NULL, "city" character varying(100) NOT NULL, "address" character varying(300) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customerId" uuid, CONSTRAINT "PK_65a6d9f31855b1020d9555d5c09" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "fumigators" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fullName" character varying(200) NOT NULL, "phone" character varying(20) NOT NULL, "country" character varying(2) NOT NULL, "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_01bc0a73ce87befa8aa4505f192" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "booking_fumigators" ("bookingsId" integer NOT NULL, "fumigatorsId" uuid NOT NULL, CONSTRAINT "PK_acae01e154df73f21bb39b67b13" PRIMARY KEY ("bookingsId", "fumigatorsId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb79345323418f83c3c367abce" ON "booking_fumigators"  ("bookingsId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_49a3b6c7c64f2243103d1faafd" ON "booking_fumigators"  ("fumigatorsId") `,
    );
    await queryRunner.query(`ALTER TABLE "bookings" ADD "endDate" date`);
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "endTime" character varying(5)`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" ADD "treatmentPlan" text`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "followUpReason" text`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "customerId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "followUpOfId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_b8512aa9cef03d90ed5744c94d7" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_locations" ADD CONSTRAINT "FK_683ed3a9b539b1ab0296882d134" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_67b9cd20f987fc6dc70f7cd283f" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_05357d0e79e9ce9b50e49c288b1" FOREIGN KEY ("followUpOfId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_fumigators" ADD CONSTRAINT "FK_bb79345323418f83c3c367abce9" FOREIGN KEY ("bookingsId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_fumigators" ADD CONSTRAINT "FK_49a3b6c7c64f2243103d1faafde" FOREIGN KEY ("fumigatorsId") REFERENCES "fumigators"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking_fumigators" DROP CONSTRAINT "FK_49a3b6c7c64f2243103d1faafde"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_fumigators" DROP CONSTRAINT "FK_bb79345323418f83c3c367abce9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_05357d0e79e9ce9b50e49c288b1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_67b9cd20f987fc6dc70f7cd283f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_locations" DROP CONSTRAINT "FK_683ed3a9b539b1ab0296882d134"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_b8512aa9cef03d90ed5744c94d7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "followUpOfId"`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "customerId"`);
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "followUpReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "treatmentPlan"`,
    );
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "endTime"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "endDate"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_49a3b6c7c64f2243103d1faafd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bb79345323418f83c3c367abce"`,
    );
    await queryRunner.query(`DROP TABLE "booking_fumigators"`);
    await queryRunner.query(`DROP TABLE "fumigators"`);
    await queryRunner.query(`DROP TABLE "customer_locations"`);
    await queryRunner.query(`DROP TABLE "customers"`);
  }
}
