import { Knex } from "knex";

import { TableName } from "../schemas";

const TABLES = [
  { table: TableName.AgentVaultService, typeCheck: "agent_vault_services_type_check" },
  { table: TableName.AgentVaultSessionInlineService, typeCheck: "agent_vault_session_inline_services_type_check" }
];

const TYPES_BEFORE = ["http", "mcp", "postgres", "mysql", "ssh"];
const NEW_TYPES = ["redis", "cockroachdb", "clickhouse"];

const inList = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

export async function up(knex: Knex): Promise<void> {
  for await (const { table, typeCheck } of TABLES) {
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, typeCheck]);
    await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("type" IN (${inList([...TYPES_BEFORE, ...NEW_TYPES])}))`, [
      table,
      typeCheck
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  for await (const { table, typeCheck } of TABLES) {
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, typeCheck]);
    await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("type" IN (${inList(TYPES_BEFORE)}))`, [table, typeCheck]);
  }
}
