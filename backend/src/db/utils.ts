import { Knex } from "knex";

import { TableName } from "./schemas";

interface PgTriggerResult {
  rows: Array<{ exists: boolean }>;
}
export const createJunctionTable = (knex: Knex, tableName: TableName, table1Name: TableName, table2Name: TableName) =>
  knex.schema.createTable(tableName, (table) => {
    table.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    table.uuid(`${table1Name}Id`).unsigned().notNullable(); // Foreign key for table1
    table.uuid(`${table2Name}Id`).unsigned().notNullable(); // Foreign key for table2
    table.foreign(`${table1Name}Id`).references("id").inTable(table1Name).onDelete("CASCADE");
    table.foreign(`${table2Name}Id`).references("id").inTable(table2Name).onDelete("CASCADE");
  });

// one time logic
// this is a postgres function log to set updateAt to present time whenever row gets updated
export const createUpdateAtTriggerFunction = (knex: Knex) =>
  knex.raw(`
CREATE OR REPLACE FUNCTION on_update_timestamp() RETURNS TRIGGER AS $$ BEGIN NEW."updatedAt" = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`);

export const dropUpdatedAtTriggerFunction = (knex: Knex) =>
  knex.raw(`
DROP FUNCTION IF EXISTS on_update_timestamp() CASCADE;
`);

// we would be using this to apply updatedAt where ever we wanta
// remember to set `timestamps(true,true,true)` before this on schema
export const createOnUpdateTrigger = async (knex: Knex, tableName: string) => {
  const triggerExists = await knex.raw<PgTriggerResult>(`
    SELECT EXISTS (
      SELECT 1 
      FROM pg_trigger 
      WHERE tgname = '${tableName}_updatedAt'
    );
  `);

  if (!triggerExists?.rows?.[0]?.exists) {
    return knex.raw(`
      CREATE TRIGGER "${tableName}_updatedAt"
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE PROCEDURE on_update_timestamp();
    `);
  }

  return null;
};

export const dropOnUpdateTrigger = (knex: Knex, tableName: string) =>
  knex.raw(`DROP TRIGGER IF EXISTS "${tableName}_updatedAt" ON ${tableName}`);
