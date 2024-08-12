import { Knex } from "knex";
import { TableName } from "./schemas";

interface JunctionTableOptions {
  table1PrimaryKey?: string;
  table2PrimaryKey?: string;
  indexForeignKeys?: boolean;
}

export const createJunctionTable = async (
  knex: Knex,
  tableName: TableName,
  table1Name: TableName,
  table2Name: TableName,
  options: JunctionTableOptions = {}
): Promise<void> => {
  const {
    table1PrimaryKey = 'id',
    table2PrimaryKey = 'id',
    indexForeignKeys = false
  } = options;

  try {
    // Check if the table already exists
    const tableExists = await knex.schema.hasTable(tableName);
    
    if (!tableExists) {
      await knex.schema.createTable(tableName, (table) => {
        table.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
        
        // Create foreign key columns
        table.uuid(`${table1Name}Id`).unsigned().notNullable();
        table.uuid(`${table2Name}Id`).unsigned().notNullable();
        
        // Set up foreign key constraints
        table.foreign(`${table1Name}Id`)
          .references(table1PrimaryKey)
          .inTable(table1Name)
          .onDelete("CASCADE");
        
        table.foreign(`${table2Name}Id`)
          .references(table2PrimaryKey)
          .inTable(table2Name)
          .onDelete("CASCADE");
        
        // Add indexes on foreign key columns if specified
        if (indexForeignKeys) {
          table.index(`${table1Name}Id`);
          table.index(`${table2Name}Id`);
        }
      });
      
      console.log(`Junction table ${tableName} created successfully.`);
    } else {
      console.log(`Table ${tableName} already exists. Skipping creation.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error creating junction table ${tableName}: ${error.message}`);
    } else {
      console.error(`An unknown error occurred while creating junction table ${tableName}`);
    }
  }
};

// one time logic
// this is a postgres function log to set updateAt to present time whenever row gets updated

export const createUpdateAtTriggerFunction = async (knex: Knex): Promise<void> => {
  try {
    await knex.raw(`
      CREATE OR REPLACE FUNCTION on_update_timestamp() RETURNS TRIGGER AS $$ BEGIN NEW."updatedAt" = NOW();
      RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      `);
    console.log(`Update timestamp function 'on_update_timestamp' created or replaced successfully.`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error creating update timestamp function: ${error.message}`);
    } else {
      console.error(`An unknown error occurred while creating update timestamp function`);
    }
  }
};

export const dropUpdatedAtTriggerFunction = async (knex: Knex): Promise<void> => {
  try {
    await knex.raw(`
      DROP FUNCTION IF EXISTS on_update_timestamp() CASCADE;
    `);
    console.log(`Update timestamp function 'on_update_timestamp' dropped successfully.`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error dropping update timestamp function: ${error.message}`);
    } else {
      console.error(`An unknown error occurred while dropping update timestamp function`);
    }
  }
};

export const createOnUpdateTrigger = async (knex: Knex, tableName: string): Promise<void> => {
  try {
    await knex.raw(`
      CREATE TRIGGER "${tableName}_updatedAt"
      BEFORE UPDATE ON ${tableName}
      FOR EACH ROW
      EXECUTE PROCEDURE on_update_timestamp();
    `);
    console.log(`Update trigger for table ${tableName} created successfully.`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error creating update trigger for table ${tableName}: ${error.message}`);
    } else {
      console.error(`An unknown error occurred while creating update trigger for table ${tableName}`);
    }
  }
};

export const dropOnUpdateTrigger = async (knex: Knex, tableName: string): Promise<void> => {
  try {
    await knex.raw(`DROP TRIGGER IF EXISTS "${tableName}_updatedAt" ON ${tableName}`);
    
    console.log(`Update trigger for table ${tableName} dropped successfully.`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error dropping update trigger for table ${tableName}: ${error.message}`);
    } else {
      console.error(`An unknown error occurred while dropping update trigger for table ${tableName}`);
    }
  }
};