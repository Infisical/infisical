import { Knex } from "knex";

import { TableName } from "../schemas";

// Each org had one implicit Agent Vault project named "Agent Vault" (rename was blocked). Now that orgs create their
// own projects, that one becomes their first, and isAgentVaultOriginal marks it as the project that clients predating
// projects (they send no projectId) keep using. The slug is kept, so nothing that addresses it changes. Drop the
// column together with the fallback after 2027-01-04.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Project, "isAgentVaultOriginal"))) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.boolean("isAgentVaultOriginal").notNullable().defaultTo(false);
    });
  }

  // The project those clients use today: the org's newest live Agent Vault project.
  await knex.raw(
    `
    UPDATE ?? SET
      "isAgentVaultOriginal" = true,
      name = CASE WHEN name = 'Agent Vault' THEN 'My first project' ELSE name END
    WHERE type = 'agent-vault' AND id IN (
      SELECT DISTINCT ON ("orgId") id FROM ??
      WHERE type = 'agent-vault' AND "deleteAfter" IS NULL
      ORDER BY "orgId", "createdAt" DESC, id DESC
    )
    `,
    [TableName.Project, TableName.Project]
  );
}

// The rename stays: a project renamed after this ran can't be told apart from one this renamed.
export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Project, "isAgentVaultOriginal")) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("isAgentVaultOriginal");
    });
  }
}
