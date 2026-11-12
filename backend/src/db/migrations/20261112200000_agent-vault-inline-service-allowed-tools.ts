import { Knex } from "knex";

import { TableName } from "../schemas";

const SERVICE = TableName.AgentVaultService;
const INLINE_ONLY_CHECK = "agent_vault_services_inline_only_check";

// Swaps the check in a short transaction, as NOT VALID so it skips the table scan while holding the ACCESS EXCLUSIVE
// lock, then validates after commit, which takes only SHARE UPDATE EXCLUSIVE and lets reads and writes through.
// That is why this migration opts out of knex's outer transaction.
const replaceInlineOnlyCheck = async (
  knex: Knex,
  condition: string,
  beforeAdd?: (trx: Knex.Transaction) => Promise<void>
) => {
  await knex.transaction(async (trx) => {
    await trx.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [SERVICE, INLINE_ONLY_CHECK]);
    if (beforeAdd) await beforeAdd(trx);
    await trx.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (${condition}) NOT VALID`, [SERVICE, INLINE_ONLY_CHECK]);
  });
  await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [SERVICE, INLINE_ONLY_CHECK]);
};

// An inline MCP server can now be limited to some of its tools, so the check keeps only member fields and OAuth off
// inline services.
export async function up(knex: Knex): Promise<void> {
  await replaceInlineOnlyCheck(
    knex,
    `"sessionId" IS NULL OR ("memberProvidedFields" IS NULL AND "credentialType" <> 'oauth')`
  );
}

// Code without inline tool lists would send a restricted inline MCP server with every tool, so its session is revoked
// instead, the way revoking it from the API does: revokedAt set and its inline services' secrets deleted. Deleting only
// the service would not do: while it exists it hides a bundle service of the same name, which the session would then
// get. The revoked session keeps its services' names and hosts for the Sessions page, with the tool list cleared.
export async function down(knex: Knex): Promise<void> {
  await replaceInlineOnlyCheck(
    knex,
    `"sessionId" IS NULL OR ("memberProvidedFields" IS NULL AND "credentialType" <> 'oauth' AND "allowedTools" IS NULL)`,
    async (trx) => {
      const sessionIds = trx(SERVICE).whereNotNull("sessionId").whereNotNull("allowedTools").distinct("sessionId");
      await trx(TableName.AgentVaultSession)
        .whereIn("id", sessionIds)
        .whereNull("revokedAt")
        .update({ revokedAt: trx.fn.now() });

      const serviceIds = trx(SERVICE).whereIn("sessionId", sessionIds).whereNull("secretsDeletedAt").select("id");
      await trx(TableName.AgentVaultServiceCustomHeader)
        .whereIn("serviceId", serviceIds)
        .update({ encryptedValue: null });
      await trx(TableName.AgentVaultServiceSubstitution)
        .whereIn("serviceId", serviceIds)
        .update({ encryptedValue: null });
      await trx(SERVICE)
        .whereIn("sessionId", sessionIds)
        .whereNull("secretsDeletedAt")
        .update({ encryptedCredential: null, secretsDeletedAt: trx.fn.now() });

      await trx(SERVICE).whereNotNull("sessionId").whereNotNull("allowedTools").update({ allowedTools: null });
    }
  );
}

const config = { transaction: false };
export { config };
