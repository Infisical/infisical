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

// A session has at most 20 inline services, so a batch passes at most 10,000 service IDs to one query.
const ROLLBACK_SESSION_BATCH_SIZE = 500;

const restrictedInlineServices = (trx: Knex.Transaction) =>
  trx(SERVICE).whereNotNull("sessionId").whereNotNull("allowedTools");

/**
 * Code without inline tool lists would send a restricted inline MCP server with every tool, so its session is revoked
 * instead, the way the API's revoke does. Deleting only the service would not do: while it exists it hides a bundle
 * service of the same name, which the session would then get. The rows stay for the Sessions page.
 *
 * Runs before the constraint swap, in its own transaction, and locks session rows, then their service rows, then the
 * services' header and substitution rows: the order the API's revoke and the hourly secret cleanup take them, so none of
 * them can deadlock with it. It sets revokedAt only where revokeIfActive would: a session whose owner or on-behalf-of
 * user was deleted has already ended, and writing it would move the updatedAt that marks when.
 *
 * Sessions go in batches, each its own transaction, so no query's parameter list or transaction grows with history.
 * Every statement in a batch works on the sessions that batch read at its start. A session minted with a tool list
 * after that keeps it, so a later batch or the check in down finds it rather than this clearing its list unrevoked.
 * Returns how many sessions the batch handled; 0 means none are left.
 */
const revokeBatchOfSessionsWithRestrictedInlineServices = (knex: Knex) =>
  knex.transaction(async (trx) => {
    const sessionIds = (
      (await restrictedInlineServices(trx).distinct("sessionId").limit(ROLLBACK_SESSION_BATCH_SIZE)) as {
        sessionId: string;
      }[]
    ).map((row) => row.sessionId);
    if (!sessionIds.length) return 0;

    const now = new Date();
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

    const services = (await trx(SERVICE)
      .whereIn("sessionId", sessionIds)
      .orderBy("id")
      .forUpdate()
      .select("id", "secretsDeletedAt")) as { id: string; secretsDeletedAt: Date | null }[];
    const withSecrets = services.filter((service) => !service.secretsDeletedAt).map((service) => service.id);

    await trx(SERVICE)
      .whereIn(
        "id",
        services.map((service) => service.id)
      )
      .update({ allowedTools: null });
    await trx(SERVICE).whereIn("id", withSecrets).update({ encryptedCredential: null, secretsDeletedAt: now });
    await trx(TableName.AgentVaultServiceCustomHeader)
      .whereIn("serviceId", withSecrets)
      .update({ encryptedValue: null });
    await trx(TableName.AgentVaultServiceSubstitution)
      .whereIn("serviceId", withSecrets)
      .update({ encryptedValue: null });
    return sessionIds.length;
  });

export async function down(knex: Knex): Promise<void> {
  // eslint-disable-next-line no-await-in-loop -- batches run one after another on purpose
  while ((await revokeBatchOfSessionsWithRestrictedInlineServices(knex)) > 0);
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
