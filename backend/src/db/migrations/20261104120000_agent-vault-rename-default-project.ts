import { Knex } from "knex";

import { TableName } from "../schemas";

// Each org had one implicit Agent Vault project named "Agent Vault" (rename was blocked). Now that orgs create
// their own projects, that one becomes their first. The slug is kept, so nothing that addresses it changes.
export async function up(knex: Knex): Promise<void> {
  await knex(TableName.Project)
    .where({ type: "agent-vault", name: "Agent Vault" })
    .update({ name: "My first project" });
}

// Not reversible: a project renamed after this ran can't be told apart from one this renamed.
export async function down(): Promise<void> {}
