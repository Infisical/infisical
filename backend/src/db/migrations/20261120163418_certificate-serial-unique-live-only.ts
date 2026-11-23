import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

const GLOBAL_SERIAL_UNIQUE_CONSTRAINT = "certificates_serialnumber_unique";
const LIVE_SERIAL_UNIQUE_INDEX = "certificates_serialnumber_live_unique";
const SERIAL_INDEX = "certificates_serialnumber_index";
const ALTER_LOCK_TIMEOUT = 10 * 1000;

export async function up(knex: Knex): Promise<void> {
  await withMigrationConnection(knex, async (raw) => {
    await createIndexConcurrently(raw, SERIAL_INDEX, `ON "${TableName.Certificate}" ("serialNumber")`);
    await createIndexConcurrently(
      raw,
      LIVE_SERIAL_UNIQUE_INDEX,
      `ON "${TableName.Certificate}" ("serialNumber") WHERE "deletedAt" IS NULL`,
      { unique: true }
    );
    await raw(`SET lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    await raw(`ALTER TABLE "${TableName.Certificate}" DROP CONSTRAINT IF EXISTS "${GLOBAL_SERIAL_UNIQUE_CONSTRAINT}"`);
  });
}

export async function down(knex: Knex): Promise<void> {
  await withMigrationConnection(knex, async (raw) => {
    const duplicates = await raw(
      `SELECT COUNT(*)::int AS count FROM (SELECT 1 FROM "${TableName.Certificate}" GROUP BY "serialNumber" HAVING COUNT(*) > 1) AS shared`
    );
    const sharedSerialCount = (duplicates.rows[0] as { count: number }).count;
    if (sharedSerialCount > 0) {
      throw new Error(
        `Can't restore the unique constraint on certificate serial numbers: ${sharedSerialCount} serial numbers are shared by more than one certificate because deleted certificates were imported again. Delete the extra certificate rows first.`
      );
    }

    await createIndexConcurrently(
      raw,
      GLOBAL_SERIAL_UNIQUE_CONSTRAINT,
      `ON "${TableName.Certificate}" ("serialNumber")`,
      {
        unique: true
      }
    );
    await raw(`SET lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    await raw(
      `ALTER TABLE "${TableName.Certificate}" ADD CONSTRAINT "${GLOBAL_SERIAL_UNIQUE_CONSTRAINT}" UNIQUE USING INDEX "${GLOBAL_SERIAL_UNIQUE_CONSTRAINT}"`
    );
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${LIVE_SERIAL_UNIQUE_INDEX}"`);
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${SERIAL_INDEX}"`);
  });
}

const config = { transaction: false };
export { config };
