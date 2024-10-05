import { Knex } from "knex";

import { TableName } from "./schemas";

export const createJunctionTable = async (
  knex: Knex,
  tableName: TableName,
  table1Name: TableName,
  table2Name: TableName,
  options?: { index?: boolean } // Optional parameter for indexing
) => {
  const tableExists = await knex.schema.hasTable(tableName);
  if (!tableExists) {
    await knex.schema.createTable(tableName, (table) => {
      table.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      table.uuid(`${table1Name}Id`).unsigned().notNullable(); // Foreign key for table1
      table.uuid(`${table2Name}Id`).unsigned().notNullable(); // Foreign key for table2
      table.foreign(`${table1Name}Id`).references("id").inTable(table1Name).onDelete("CASCADE");
      table.foreign(`${table2Name}Id`).references("id").inTable(table2Name).onDelete("CASCADE");

      // Optional indexing for faster queries
      if (options?.index) {
        table.index([`${table1Name}Id`, `${table2Name}Id`], `${tableName}_idx`);
      }
    });
  } else {
    console.log(`Table ${tableName} already exists, skipping creation.`);
  }
};


// one time logic
// this is a postgres function log to set updateAt to present time whenever row gets updated
// Create the update timestamp trigger function with improved error handling
export const createUpdateAtTriggerFunction = async (knex: Knex) => {
  try {
    await knex.raw(`
      CREATE OR REPLACE FUNCTION on_update_timestamp() RETURNS TRIGGER AS $$ 
      BEGIN 
        NEW."updatedAt" = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log("on_update_timestamp function created successfully");
  } catch (error) {
    console.error("Error creating on_update_timestamp function:", error);
  }
};

// Drop the update timestamp trigger function with improved error handling
export const dropUpdatedAtTriggerFunction = async (knex: Knex) => {
  try {
    await knex.raw(`
      DROP FUNCTION IF EXISTS on_update_timestamp() CASCADE;
    `);
    console.log("on_update_timestamp function dropped successfully");
  } catch (error) {
    console.error("Error dropping on_update_timestamp function:", error);
  }
};

// Create the on-update trigger for a table with improved error handling
export const createOnUpdateTrigger = async (knex: Knex, tableName: string) => {
  try {
    await knex.raw(`
      CREATE TRIGGER "${tableName}_updatedAt"
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE PROCEDURE on_update_timestamp();
    `);
    console.log(`Trigger ${tableName}_updatedAt created successfully`);
  } catch (error) {
    console.error(`Error creating trigger ${tableName}_updatedAt:`, error);
  }
};

// Drop the on-update trigger for a table with improved error handling
export const dropOnUpdateTrigger = async (knex: Knex, tableName: string) => {
  try {
    await knex.raw(`
      DROP TRIGGER IF EXISTS "${tableName}_updatedAt" ON ${tableName};
    `);
    console.log(`Trigger ${tableName}_updatedAt dropped successfully`);
  } catch (error) {
    console.error(`Error dropping trigger ${tableName}_updatedAt:`, error);
  }
};