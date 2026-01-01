import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameToClinicalProfile1703206800000 implements MigrationInterface {
  name = 'RenameToClinicalProfile1703206800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename conversationContext column to clinicalProfile
    await queryRunner.query(`
      ALTER TABLE "user"
      RENAME COLUMN "conversationContext" TO "clinicalProfile"
    `);

    // Rename contextUpdatedAt column to clinicalProfileUpdatedAt
    await queryRunner.query(`
      ALTER TABLE "user"
      RENAME COLUMN "contextUpdatedAt" TO "clinicalProfileUpdatedAt"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the changes if migration needs to be rolled back
    await queryRunner.query(`
      ALTER TABLE "user"
      RENAME COLUMN "clinicalProfile" TO "conversationContext"
    `);

    await queryRunner.query(`
      ALTER TABLE "user"
      RENAME COLUMN "clinicalProfileUpdatedAt" TO "contextUpdatedAt"
    `);
  }
}
