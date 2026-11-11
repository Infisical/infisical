import { Knex } from "knex";

import { TableName } from "../schemas";
import { createIndexConcurrently, withMigrationConnection } from "./utils/concurrent-index";

const REVOKED_CA_INDEX = "certificates_caid_revokedat_revoked_index";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Certificate, "revokedAt"))) return;

  await withMigrationConnection(knex, async (raw) => {
    await createIndexConcurrently(
      raw,
      REVOKED_CA_INDEX,
      `ON "${TableName.Certificate}" ("caId", "revokedAt") WHERE "status" = 'revoked'`
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${REVOKED_CA_INDEX}"`);
}

const config = { transaction: false };
export { config };
