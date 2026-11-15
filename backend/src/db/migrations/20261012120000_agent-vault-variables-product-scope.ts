import { Knex } from "knex";

import { TableName } from "../schemas";
import { findVariableKeyRenames, TVariableKeyRow } from "./utils/agent-vault-variable-key-dedupe";

const PROJECT_KEY_UNIQUE = "agent_vault_variables_projectid_key_unique";
const RENAME_BATCH_SIZE = 500;

// accessBundleId stays, nullable and no longer cascading, for one release: a pod still on the previous release
// resolves variables by it while this one rolls out. Nothing in this release reads or writes it.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AgentVaultVariable, "projectId")) return;

  await knex.schema.alterTable(TableName.AgentVaultVariable, (t) => {
    t.string("projectId", 36);
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
  });

  await knex.raw(`UPDATE ?? AS v SET "projectId" = b."projectId" FROM ?? AS b WHERE b.id = v."accessBundleId"`, [
    TableName.AgentVaultVariable,
    TableName.AgentVaultAccessBundle
  ]);

  const rows = (await knex(TableName.AgentVaultVariable).select(
    "id",
    "projectId",
    "key",
    "createdAt"
  )) as TVariableKeyRow[];

  const renames = [...findVariableKeyRenames(rows)];
  for (let i = 0; i < renames.length; i += RENAME_BATCH_SIZE) {
    const batch = renames.slice(i, i + RENAME_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(
      `UPDATE ?? AS v SET "key" = r."key" FROM (VALUES ${batch.map(() => "(?::uuid, ?)").join(", ")}) AS r("id", "key") WHERE v.id = r."id"`,
      [TableName.AgentVaultVariable, ...batch.flat()]
    );
  }

  await knex.schema.alterTable(TableName.AgentVaultVariable, (t) => {
    t.dropNullable("projectId");
    // Also the index the projectId foreign key needs, as its leftmost column.
    t.unique(["projectId", "key"], { indexName: PROJECT_KEY_UNIQUE });

    t.dropForeign(["accessBundleId"]);
    t.setNullable("accessBundleId");
    t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("SET NULL");
  });
}

// Best effort. A variable goes back to the bundle of a service that uses it, or to the project's oldest bundle,
// and one with neither is deleted. Services in any other bundle that use it stop resolving it.
export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultVariable, "projectId"))) return;

  await knex.raw(
    `UPDATE ?? AS v SET "accessBundleId" = (
      SELECT s."accessBundleId" FROM ?? AS r JOIN ?? AS s ON s.id = r."serviceId"
      WHERE r."variableId" = v.id ORDER BY s."createdAt" LIMIT 1
    ) WHERE v."accessBundleId" IS NULL`,
    [TableName.AgentVaultVariable, TableName.AgentVaultServiceVariableReference, TableName.AgentVaultService]
  );
  await knex.raw(
    `UPDATE ?? AS v SET "accessBundleId" = (
      SELECT b.id FROM ?? AS b WHERE b."projectId" = v."projectId" ORDER BY b."createdAt" LIMIT 1
    ) WHERE v."accessBundleId" IS NULL`,
    [TableName.AgentVaultVariable, TableName.AgentVaultAccessBundle]
  );
  await knex(TableName.AgentVaultVariable).whereNull("accessBundleId").delete();

  // The analytics view selects these columns, and Postgres won't drop a column a view uses. The next
  // regeneration recreates it.
  await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultVariable]);

  await knex.schema.alterTable(TableName.AgentVaultVariable, (t) => {
    t.dropForeign(["accessBundleId"]);
    t.dropNullable("accessBundleId");
    t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("CASCADE");

    t.dropUnique(["projectId", "key"], PROJECT_KEY_UNIQUE);
    t.dropForeign(["projectId"]);
    t.dropColumn("projectId");
  });
}
