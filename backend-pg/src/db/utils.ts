import { Knex } from "knex";

export const createJunctionTable = (
  knex: Knex,
  tableName: string,
  table1Name: string,
  table2Name: string
) =>
  knex.schema.createTable(tableName, (table) => {
    table.increments(); // Primary key
    table.integer(`${table1Name}Id`).unsigned().notNullable(); // Foreign key for table1
    table.integer(`${table2Name}Id`).unsigned().notNullable(); // Foreign key for table2
    table.foreign(`${table1Name}Id`).references("id").inTable(table2Name);
    table.foreign(`${table2Name}Id`).references("id").inTable(table1Name);
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
export const createOnUpdateTrigger = (knex: Knex, tableName: string) =>
  knex.raw(`
CREATE TRIGGER "${tableName}_updatedAt"
BEFORE UPDATE ON ${tableName}
FOR EACH ROW
EXECUTE PROCEDURE on_update_timestamp();
`);

export const dropOnUpdateTrigger = (knex: Knex, tableName: string) =>
  knex.raw(`DROP TRIGGER IF EXISTS "${tableName}_updatedAt" ON ${tableName}`);
