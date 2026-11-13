/* eslint-disable no-await-in-loop -- batches run one after another on purpose */
import { Knex } from "knex";

import { KmsDataKey } from "@app/domains/platform/kms-core/ce/module";
import { initLogger, logger } from "@app/lib/logger";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { findServiceNameRenames, TServiceNameRow } from "./utils/agent-vault-service-name-dedupe";
import { getMigrationEnvConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices } from "./utils/services";

const SERVICE = TableName.AgentVaultService;
const LINK = TableName.AgentVaultAccessBundleService;
const INLINE = TableName.AgentVaultSessionInlineService;

const PROJECT_NAME_UNIQUE = "agent_vault_services_project_name_unique";
const SESSION_POSITION_UNIQUE = "agent_vault_services_session_position_unique";
const INLINE_WITH_SECRETS_INDEX = "agent_vault_services_inline_with_secrets";
const NAME_CHECK = "agent_vault_services_name_check";
const INLINE_POSITION_CHECK = "agent_vault_services_inline_position_check";
const INLINE_ONLY_CHECK = "agent_vault_services_inline_only_check";

const RENAME_BATCH_SIZE = 500;
const SECRETS_BATCH_SIZE = 100;

// Frozen copy of the sealed shape of an inline service's secrets, so later changes to the app can't change what this
// migration reads.
type TInlineSecrets = {
  credential: Record<string, string> | null;
  customHeaders: string[];
  substitutions: string[];
};

// Inline rows still holding secrets belong to sessions that can resolve, so their secrets are opened and sealed again
// field by field, the way a bundle service keeps them. Every other inline row's secrets were already deleted.
const resealInlineSecrets = async (knex: Knex) => {
  const hasSecrets = await knex(INLINE).whereNotNull("encryptedSecrets").first("id");
  if (!hasSecrets) return;

  const envConfig = await getMigrationEnvConfig(superAdminDALFactory(knex));
  const { dataKeyService } = await getMigrationEncryptionServices({ envConfig, db: knex });
  const cipherCache =
    createCircularCache<Awaited<ReturnType<(typeof dataKeyService)["createCipherPairWithDataKey"]>>>(25);

  let lastId: string | undefined;
  let resealed = 0;
  for (;;) {
    const cursor = lastId;
    const rows = (await knex(INLINE)
      .join(TableName.AgentVaultSession, `${INLINE}.sessionId`, `${TableName.AgentVaultSession}.id`)
      .whereNotNull(`${INLINE}.encryptedSecrets`)
      .modify((query) => {
        if (cursor) void query.where(`${INLINE}.id`, ">", cursor);
      })
      .orderBy(`${INLINE}.id`)
      .limit(SECRETS_BATCH_SIZE)
      .select(
        `${INLINE}.id`,
        `${INLINE}.encryptedSecrets`,
        knex.ref("projectId").withSchema(TableName.AgentVaultSession)
      )) as { id: string; encryptedSecrets: Buffer; projectId: string }[];
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;

    for (const row of rows) {
      let cipher = cipherCache.getItem(row.projectId);
      if (!cipher) {
        cipher = await dataKeyService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: row.projectId
        });
        cipherCache.push(row.projectId, cipher);
      }
      const { encryptor, decryptor } = cipher;
      const seal = (value: unknown) => encryptor({ plainText: Buffer.from(JSON.stringify(value)) }).cipherTextBlob;
      const secrets = JSON.parse(
        decryptor({ cipherTextBlob: row.encryptedSecrets }).toString("utf-8")
      ) as TInlineSecrets;

      if (secrets.credential) {
        await knex(SERVICE)
          .where({ id: row.id })
          .update({ encryptedCredential: seal(secrets.credential) });
      }
      for (const [position, value] of secrets.customHeaders.entries()) {
        await knex(TableName.AgentVaultServiceCustomHeader)
          .where({ serviceId: row.id, position })
          .update({ encryptedValue: seal({ value }) });
      }
      for (const [position, value] of secrets.substitutions.entries()) {
        await knex(TableName.AgentVaultServiceSubstitution)
          .where({ serviceId: row.id, position })
          .update({ encryptedValue: seal({ value }) });
      }
      resealed += 1;
    }
  }

  // The secrets now live with the services. A pod still on the previous release finds none here and leaves these
  // services out of resolve until it is replaced, rather than sending secrets no revoke would ever delete.
  await knex(INLINE).whereNotNull("encryptedSecrets").update({ encryptedSecrets: null });
  logger.info(`agent-vault-project-services: moved the secrets of ${resealed} inline services`);
};

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(SERVICE, "projectId")) return;
  initLogger();

  await knex.schema.alterTable(SERVICE, (t) => {
    t.string("projectId", 36);
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    // The projectId foreign key's cascade needs an index over every row, which the partial ones below aren't.
    t.index("projectId");

    // Set on an inline service: one sent with a session, which belongs to that session alone.
    t.uuid("sessionId");
    t.foreign("sessionId").references("id").inTable(TableName.AgentVaultSession).onDelete("CASCADE");
    t.integer("position");
    // When an inline service's secrets were deleted because its session ended.
    t.timestamp("secretsDeletedAt", { useTz: true });

    // NULL only for an inline service sent without a name, which goes by its first host.
    t.setNullable("name");
  });

  await knex.raw(`UPDATE ?? AS s SET "projectId" = b."projectId" FROM ?? AS b WHERE b.id = s."accessBundleId"`, [
    SERVICE,
    TableName.AgentVaultAccessBundle
  ]);

  await knex.schema.createTable(LINK, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

    t.uuid("accessBundleId").notNullable();
    t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("CASCADE");

    t.uuid("serviceId").notNullable();
    t.foreign("serviceId").references("id").inTable(SERVICE).onDelete("CASCADE");
    t.index("serviceId");

    t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Also the index the accessBundleId foreign key needs, as its leftmost column.
    t.unique(["accessBundleId", "serviceId"]);
  });
  await knex.raw(
    `INSERT INTO ?? ("accessBundleId", "serviceId", "createdAt") SELECT "accessBundleId", id, "createdAt" FROM ?? WHERE "accessBundleId" IS NOT NULL`,
    [LINK, SERVICE]
  );

  const nameRows = (await knex(SERVICE)
    .join(TableName.AgentVaultAccessBundle, `${SERVICE}.accessBundleId`, `${TableName.AgentVaultAccessBundle}.id`)
    .select(
      `${SERVICE}.id`,
      `${SERVICE}.projectId`,
      `${SERVICE}.name`,
      `${SERVICE}.type`,
      `${SERVICE}.createdAt`,
      knex.ref("name").withSchema(TableName.AgentVaultAccessBundle).as("accessBundleName")
    )) as TServiceNameRow[];
  // Live sessions' inline services: a renamed service can't take one of their names (see findServiceNameRenames).
  const liveInlineNames = new Map<string, Set<string>>();
  if (await knex.schema.hasTable(INLINE)) {
    const liveInline = (await knex(INLINE)
      .join(TableName.AgentVaultSession, `${INLINE}.sessionId`, `${TableName.AgentVaultSession}.id`)
      .whereNotNull(`${INLINE}.name`)
      .whereNull(`${TableName.AgentVaultSession}.revokedAt`)
      .where((query) => {
        void query
          .whereNull(`${TableName.AgentVaultSession}.expiresAt`)
          .orWhere(`${TableName.AgentVaultSession}.expiresAt`, ">", knex.fn.now());
      })
      .distinct(`${TableName.AgentVaultSession}.projectId`, `${INLINE}.name`)) as { projectId: string; name: string }[];
    liveInline.forEach(({ projectId, name }) => {
      const names = liveInlineNames.get(projectId) ?? new Set<string>();
      names.add(name);
      liveInlineNames.set(projectId, names);
    });
  }
  const renames = [...findServiceNameRenames(nameRows, liveInlineNames)];
  for (let i = 0; i < renames.length; i += RENAME_BATCH_SIZE) {
    const batch = renames.slice(i, i + RENAME_BATCH_SIZE);
    await knex.raw(
      `UPDATE ?? AS s SET "name" = r."name" FROM (VALUES ${batch.map(() => "(?::uuid, ?)").join(", ")}) AS r("id", "name") WHERE s.id = r."id"`,
      [SERVICE, ...batch.flat()]
    );
  }
  if (renames.length) logger.info(`agent-vault-project-services: renamed ${renames.length} services`);

  // A pod still on the previous release reads a bundle's services by accessBundleId, so it stays, filled in for the
  // services that had one, until the release after this one. Nothing in this release reads or writes it.
  await knex.schema.alterTable(SERVICE, (t) => {
    t.dropForeign(["accessBundleId"]);
    t.setNullable("accessBundleId");
    t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("SET NULL");
  });

  // An inline service's values go once its session ends, while its header names and placeholders stay for history.
  await knex.schema.alterTable(TableName.AgentVaultServiceCustomHeader, (t) => {
    t.setNullable("encryptedValue");
  });
  await knex.schema.alterTable(TableName.AgentVaultServiceSubstitution, (t) => {
    t.setNullable("encryptedValue");
  });

  if (await knex.schema.hasTable(INLINE)) {
    // An inline service keeps its id, so session logs and audit events that named it still point at it.
    await knex.raw(
      `INSERT INTO ?? (id, "projectId", "sessionId", position, name, description, type, config, "hostPattern",
        "allowedMethods", "allowedPathPrefixes", "credentialType", "credentialConfig", "createdAt", "updatedAt",
        "secretsDeletedAt")
      SELECT i.id, s."projectId", i."sessionId", i.position, i.name, i.description, i.type, i.config, i."hostPattern",
        i."allowedMethods", i."allowedPathPrefixes", i."credentialType", i."credentialConfig", i."createdAt",
        i."updatedAt",
        CASE WHEN i."encryptedSecrets" IS NULL AND (i."credentialType" <> 'passthrough'
          OR jsonb_array_length(i."customHeaders") > 0 OR jsonb_array_length(i."substitutions") > 0)
        THEN NOW() END
      FROM ?? AS i JOIN ?? AS s ON s.id = i."sessionId"`,
      [SERVICE, INLINE, TableName.AgentVaultSession]
    );
    await knex.raw(
      `INSERT INTO ?? ("serviceId", name, prefix, position)
      SELECT i.id, h.value->>'name', COALESCE(h.value->>'prefix', ''), (h.ordinality - 1)::int
      FROM ?? AS i, jsonb_array_elements(i."customHeaders") WITH ORDINALITY AS h`,
      [TableName.AgentVaultServiceCustomHeader, INLINE]
    );
    await knex.raw(
      `INSERT INTO ?? ("serviceId", placeholder, surfaces, position)
      SELECT i.id, x.value->>'placeholder', ARRAY(SELECT jsonb_array_elements_text(x.value->'surfaces')),
        (x.ordinality - 1)::int
      FROM ?? AS i, jsonb_array_elements(i."substitutions") WITH ORDINALITY AS x`,
      [TableName.AgentVaultServiceSubstitution, INLINE]
    );
    await resealInlineSecrets(knex);
  }

  await knex.schema.alterTable(SERVICE, (t) => {
    t.dropNullable("projectId");
  });
  await knex.raw(`CREATE UNIQUE INDEX ?? ON ?? ("projectId", name) WHERE "sessionId" IS NULL`, [
    PROJECT_NAME_UNIQUE,
    SERVICE
  ]);
  // sessionId leads, so the index also serves the session foreign key's cascade.
  await knex.raw(`CREATE UNIQUE INDEX ?? ON ?? ("sessionId", position) WHERE "sessionId" IS NOT NULL`, [
    SESSION_POSITION_UNIQUE,
    SERVICE
  ]);
  // The hourly cleanup looks only at inline services that may still hold secrets, never at ended sessions' history.
  await knex.raw(`CREATE INDEX ?? ON ?? ("sessionId") WHERE "sessionId" IS NOT NULL AND "secretsDeletedAt" IS NULL`, [
    INLINE_WITH_SECRETS_INDEX,
    SERVICE
  ]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("sessionId" IS NOT NULL OR name IS NOT NULL)`, [
    SERVICE,
    NAME_CHECK
  ]);
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (("sessionId" IS NULL) = (position IS NULL) AND ("sessionId" IS NOT NULL OR "secretsDeletedAt" IS NULL))`,
    [SERVICE, INLINE_POSITION_CHECK]
  );
  // An inline service has every value sent with its session, so nothing is left to members, nothing signs in, and no
  // tool list narrows it.
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("sessionId" IS NULL OR ("memberProvidedFields" IS NULL AND "credentialType" <> 'oauth' AND "allowedTools" IS NULL))`,
    [SERVICE, INLINE_ONLY_CHECK]
  );
}

// Best effort. Inline services move back to their old table's rows, which no longer hold secrets, so those services stop
// resolving. A service in no access bundle is deleted, and one in several goes back to the oldest link.
export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(SERVICE, "projectId"))) return;

  await knex(SERVICE).whereNotNull("sessionId").delete();
  await knex.raw(
    `UPDATE ?? AS s SET "accessBundleId" = (
      SELECT l."accessBundleId" FROM ?? AS l WHERE l."serviceId" = s.id ORDER BY l."createdAt", l.id LIMIT 1
    ) WHERE s."accessBundleId" IS NULL`,
    [SERVICE, LINK]
  );
  await knex(SERVICE).whereNull("accessBundleId").delete();
  await knex.schema.dropTableIfExists(LINK);

  for (const table of [TableName.AgentVaultServiceCustomHeader, TableName.AgentVaultServiceSubstitution]) {
    await knex(table).whereNull("encryptedValue").delete();
    await knex.schema.alterTable(table, (t) => {
      t.dropNullable("encryptedValue");
    });
  }

  // The analytics view selects these columns, and Postgres won't drop a column a view uses. The next regeneration
  // recreates it.
  await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [SERVICE]);
  for (const constraint of [NAME_CHECK, INLINE_POSITION_CHECK, INLINE_ONLY_CHECK]) {
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [SERVICE, constraint]);
  }
  for (const index of [PROJECT_NAME_UNIQUE, SESSION_POSITION_UNIQUE, INLINE_WITH_SECRETS_INDEX]) {
    await knex.raw(`DROP INDEX IF EXISTS ??`, [index]);
  }
  await knex.schema.alterTable(SERVICE, (t) => {
    t.dropForeign(["accessBundleId"]);
    t.dropNullable("accessBundleId");
    t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("CASCADE");
    t.dropNullable("name");
    t.dropForeign(["sessionId"]);
    t.dropColumn("sessionId");
    t.dropColumn("position");
    t.dropColumn("secretsDeletedAt");
    t.dropIndex(["projectId"]);
    t.dropForeign(["projectId"]);
    t.dropColumn("projectId");
  });
}
