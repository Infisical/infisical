import { Knex } from "knex";

import { TableName } from "../schemas";

const FUNCTION_NAME = "agent_vault_session_revoke_on_owner_removed";
const TRIGGER_NAME = "agent_vault_sessions_revoke_on_owner_removed";

export async function up(knex: Knex): Promise<void> {
  // Until now the removal time was only implied by updatedAt, which nothing else had touched on these rows.
  await knex.raw(
    `UPDATE ?? SET "revokedAt" = "updatedAt" WHERE "userId" IS NULL AND "identityId" IS NULL AND "revokedAt" IS NULL`,
    [TableName.AgentVaultSession]
  );

  // The owner columns are cleared by ON DELETE SET NULL from whichever path deletes the user or identity, so only
  // the database sees the moment a session loses its owner.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION ${FUNCTION_NAME}() RETURNS TRIGGER AS $$
    BEGIN
      NEW."revokedAt" = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.raw(`DROP TRIGGER IF EXISTS "${TRIGGER_NAME}" ON ??`, [TableName.AgentVaultSession]);
  await knex.raw(
    `
    CREATE TRIGGER "${TRIGGER_NAME}"
    BEFORE UPDATE ON ??
    FOR EACH ROW
    WHEN (
      NEW."userId" IS NULL AND NEW."identityId" IS NULL
      AND (OLD."userId" IS NOT NULL OR OLD."identityId" IS NOT NULL)
      AND NEW."revokedAt" IS NULL
    )
    EXECUTE PROCEDURE ${FUNCTION_NAME}();
  `,
    [TableName.AgentVaultSession]
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TRIGGER IF EXISTS "${TRIGGER_NAME}" ON ??`, [TableName.AgentVaultSession]);
  await knex.raw(`DROP FUNCTION IF EXISTS ${FUNCTION_NAME}()`);
}
