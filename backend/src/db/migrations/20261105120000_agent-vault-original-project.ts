import { Knex } from "knex";

import { TableName } from "../schemas";

// Marks the Agent Vault project that clients predating projects (they send no projectId) have used so far, so the
// fallback keeps sending them there however many projects the org creates. That was the org's newest live one.
// Drop together with the fallback after 2027-01-04.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Project, "isAgentVaultOriginal"))) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.boolean("isAgentVaultOriginal").notNullable().defaultTo(false);
    });
  }

  await knex.raw(
    `
    UPDATE ?? SET "isAgentVaultOriginal" = true
    WHERE id IN (
      SELECT DISTINCT ON ("orgId") id FROM ??
      WHERE type = 'agent-vault' AND "deleteAfter" IS NULL
      ORDER BY "orgId", "createdAt" DESC, id DESC
    )
    `,
    [TableName.Project, TableName.Project]
  );
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Project, "isAgentVaultOriginal")) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("isAgentVaultOriginal");
    });
  }
}
