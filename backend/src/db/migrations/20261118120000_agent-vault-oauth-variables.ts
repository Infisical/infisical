import { Knex } from "knex";

import { TableName } from "../schemas";

const VARIABLE = TableName.AgentVaultVariable;
const SERVICE = TableName.AgentVaultService;
const SESSION = TableName.AgentVaultSession;

const TYPE_CHECK = "agent_vault_variables_type_check";
const OAUTH_CONFIG_CHECK = "agent_vault_variables_oauth_config_check";
const TEXT_VALUE_CHECK = "agent_vault_variables_text_value_check";
const OAUTH_GLOBAL_CHECK = "agent_vault_variables_oauth_global_check";
const INLINE_ONLY_CHECK = "agent_vault_services_inline_only_check";

const VARIABLE_CHECKS: [string, string][] = [
  [TYPE_CHECK, `"type" IN ('text', 'oauth')`],
  [OAUTH_CONFIG_CHECK, `("type" = 'oauth') = ("oauthConfig" IS NOT NULL)`],
  // An OAuth variable holds no value until it is signed in; a text variable always has one.
  [TEXT_VALUE_CHECK, `"type" <> 'text' OR "encryptedValue" IS NOT NULL`],
  [OAUTH_GLOBAL_CHECK, `"type" <> 'oauth' OR ("userId" IS NULL AND "identityId" IS NULL)`]
];

const INLINE_ONLY_BEFORE = `"sessionId" IS NULL OR ("memberProvidedFields" IS NULL AND "credentialType" <> 'oauth')`;
const INLINE_ONLY_AFTER = `"sessionId" IS NULL OR "memberProvidedFields" IS NULL`;

// Each check is added NOT VALID inside the short transaction that holds the ACCESS EXCLUSIVE lock, then validated after
// commit, which takes only SHARE UPDATE EXCLUSIVE and lets reads and writes through. That is why this migration opts
// out of knex's outer transaction.
const addChecks = async (knex: Knex, table: TableName, checks: [string, string][]) => {
  await knex.transaction(async (trx) => {
    for (const [name, condition] of checks) {
      // eslint-disable-next-line no-await-in-loop
      await trx.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, name]);
      // eslint-disable-next-line no-await-in-loop
      await trx.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (${condition}) NOT VALID`, [table, name]);
    }
  });
  for (const [name] of checks) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [table, name]);
  }
};

// An inline service can now take an OAuth credential: an OAuth variable by key, or tokens the session sends.
export async function up(knex: Knex): Promise<void> {
  const hasType = await knex.schema.hasColumn(VARIABLE, "type");
  const hasOauthConfig = await knex.schema.hasColumn(VARIABLE, "oauthConfig");
  await knex.transaction(async (trx) => {
    if (!hasType || !hasOauthConfig) {
      await trx.schema.alterTable(VARIABLE, (t) => {
        if (!hasType) t.string("type", 16).notNullable().defaultTo("text");
        // The provider settings and the non-secret half of the connection. NULL on every text variable.
        if (!hasOauthConfig) t.jsonb("oauthConfig");
      });
    }
    await trx.raw(`ALTER TABLE ?? ALTER COLUMN "encryptedValue" DROP NOT NULL`, [VARIABLE]);
  });

  await addChecks(knex, VARIABLE, VARIABLE_CHECKS);
  await addChecks(knex, SERVICE, [[INLINE_ONLY_CHECK, INLINE_ONLY_AFTER]]);
}

// The inline services the old check refuses: any that takes an OAuth credential.
const inlineOauthServices = (trx: Knex.Transaction) =>
  trx(SERVICE).whereNotNull("sessionId").where("credentialType", "oauth");

const PASSTHROUGH = {
  credentialType: "passthrough",
  credentialConfig: JSON.stringify({ type: "passthrough" }),
  encryptedCredential: null
};
// An MCP service can't be passthrough, so it gets a bearer credential with no token, which an admin has to set.
const EMPTY_BEARER = {
  credentialType: "bearer",
  credentialConfig: JSON.stringify({ type: "bearer", headerName: "Authorization", headerPrefix: "Bearer" }),
  encryptedCredential: null
};

const replaceCredentials = async (rows: Knex.QueryBuilder) => {
  await rows.clone().where("type", "mcp").update(EMPTY_BEARER);
  await rows.clone().whereNot("type", "mcp").update(PASSTHROUGH);
};

/**
 * Code without OAuth variables can't send what these rows hold, so the rows are made passthrough (an empty bearer
 * credential for MCP). A bundle service that used an OAuth variable keeps reaching its host, without a credential, until
 * an admin sets a new one. A session with an inline OAuth service is revoked first, the way the API's revoke does, then
 * those inline rows are deleted, since the old code can't read them. Locks session rows, then their service rows: the
 * order the API's revoke and the hourly secret cleanup take them.
 */
const removeOauthVariableUses = (knex: Knex) =>
  knex.transaction(async (trx) => {
    const oauthVariableIds = trx(VARIABLE).where("type", "oauth").select("id");

    const sessionIds = (
      (await inlineOauthServices(trx).distinct("sessionId").orderBy("sessionId")) as { sessionId: string }[]
    ).map((row) => row.sessionId);
    if (sessionIds.length) {
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
        .where((qb) => {
          void qb.whereNull("expiresAt").orWhere("expiresAt", ">", now);
        })
        .update({ revokedAt: now });

      const serviceIds = (
        (await inlineOauthServices(trx).whereIn("sessionId", sessionIds).orderBy("id").forUpdate().select("id")) as {
          id: string;
        }[]
      ).map((row) => row.id);
      await trx(SERVICE).whereIn("id", serviceIds).delete();
    }

    // Personal values can only use their owner's personal variables, and an OAuth variable is never personal, so only
    // services reference one.
    await trx(TableName.AgentVaultServiceVariableReference).whereIn("variableId", oauthVariableIds).delete();
    await replaceCredentials(
      trx(SERVICE)
        .whereNull("sessionId")
        .where("credentialType", "oauth")
        .whereRaw(`"credentialConfig"->>'source' = 'variable'`)
    );

    await trx(VARIABLE).where("type", "oauth").delete();
  });

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(VARIABLE, "type")) {
    await removeOauthVariableUses(knex);
  }

  await knex.transaction(async (trx) => {
    for (const [name] of VARIABLE_CHECKS) {
      // eslint-disable-next-line no-await-in-loop
      await trx.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [VARIABLE, name]);
    }
    await trx.raw(`ALTER TABLE ?? ALTER COLUMN "encryptedValue" SET NOT NULL`, [VARIABLE]);
    const hasType = await trx.schema.hasColumn(VARIABLE, "type");
    const hasOauthConfig = await trx.schema.hasColumn(VARIABLE, "oauthConfig");
    if (hasType || hasOauthConfig) {
      await trx.schema.alterTable(VARIABLE, (t) => {
        if (hasType) t.dropColumn("type");
        if (hasOauthConfig) t.dropColumn("oauthConfig");
      });
    }
  });

  await addChecks(knex, SERVICE, [[INLINE_ONLY_CHECK, INLINE_ONLY_BEFORE]]);
}

const config = { transaction: false };
export { config };
