import { Knex } from "knex";

import { TableName } from "../schemas";

const SERVICE = TableName.AgentVaultService;
const SESSION = TableName.AgentVaultSession;
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

const restrictedInlineServices = (trx: Knex.Transaction) =>
  trx(SERVICE).whereNotNull("sessionId").whereNotNull("allowedTools");

/**
 * Code without inline tool lists would send a restricted inline MCP server with every tool, so its session is revoked
 * instead, the way the API's revoke does. Deleting only the service would not do: while it exists it hides a bundle
 * service of the same name, which the session would then get. The rows stay for the Sessions page.
 *
 * Runs before the constraint swap, in its own transaction, and takes session rows before service rows, the order the
 * API's revoke takes them, so the two can't deadlock. It sets revokedAt only where revokeIfActive would: a session whose
 * owner or on-behalf-of user was deleted has already ended, and writing it would move the updatedAt that marks when.
 */
const revokeSessionsWithRestrictedInlineServices = (knex: Knex) =>
  knex.transaction(async (trx) => {
    const now = new Date();
    const sessionIds = restrictedInlineServices(trx).distinct("sessionId");
    await trx(SESSION)
      .whereIn("id", sessionIds)
      .whereNull("revokedAt")
      .where((qb) => {
        void qb.whereNotNull("userId").orWhereNotNull("identityId");
      })
      .where((qb) => {
        void qb.whereNull("onBehalfOfUserName").orWhereNotNull("onBehalfOfUserId");
      })
      .update({ revokedAt: now });

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
      .update({ encryptedCredential: null, secretsDeletedAt: now });

    await restrictedInlineServices(trx).update({ allowedTools: null });
  });

export async function down(knex: Knex): Promise<void> {
  await revokeSessionsWithRestrictedInlineServices(knex);
  await replaceInlineOnlyCheck(
    knex,
    `"sessionId" IS NULL OR ("memberProvidedFields" IS NULL AND "credentialType" <> 'oauth' AND "allowedTools" IS NULL)`,
    async (trx) => {
      // Only a session minted with a tool list after the revocation above, by servers still running the newer code.
      // Revoking it here would take a session row after the services table lock, so stop instead.
      const [{ count }] = (await restrictedInlineServices(trx).count("id as count")) as { count: string | number }[];
      if (Number(count) > 0) {
        throw new Error(
          `${count} inline services with a tool list were created during this rollback. Stop the servers running the newer code, then run the rollback again.`
        );
      }
    }
  );
}

const config = { transaction: false };
export { config };
