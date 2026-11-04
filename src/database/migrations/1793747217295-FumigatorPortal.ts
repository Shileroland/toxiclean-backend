/** Fumigator portal logins (fumigators.userId, invitedAt) and bookings' treatment records. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FumigatorPortal1793747217295 implements MigrationInterface {
  name = 'FumigatorPortal1793747217295';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD "userId" uuid, ADD "invitedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD CONSTRAINT "UQ_a966ce334eac2a672301e8a449d" UNIQUE ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" ADD CONSTRAINT "FK_a966ce334eac2a672301e8a449d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "treatmentRecord" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "treatmentRecord"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" DROP CONSTRAINT "FK_a966ce334eac2a672301e8a449d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" DROP CONSTRAINT "UQ_a966ce334eac2a672301e8a449d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fumigators" DROP COLUMN "invitedAt", DROP COLUMN "userId"`,
    );
  }
}
