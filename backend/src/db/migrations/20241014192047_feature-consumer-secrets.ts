import { Knex } from "knex";
import { TableName } from "../schemas";

import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";


export async function up(knex: Knex): Promise<void> {
    const tableExists = await knex.schema.hasTable(TableName.ConsumerSecret);
  
    if (!tableExists) {
      await knex.schema.createTable(TableName.ConsumerSecret, (table) => {
        table.uuid("id").primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string("name").notNullable();
        table.string("type").notNullable();
        table.uuid("orgId").notNullable().references("id").inTable(TableName.Organization).onDelete("CASCADE");
        table.uuid("userId").notNullable().references("id").inTable(TableName.Users).onDelete("CASCADE");
        table.string("data").notNullable();
  
        table.timestamps(true, true);
      });
  
      await createOnUpdateTrigger(knex, TableName.ConsumerSecret);
    }
  }
  


  export async function down(knex: Knex): Promise<void> {
    await knex.schema.hasTable(TableName.ConsumerSecret).then(async (exists) => {
      if (exists) {
        await knex.schema.dropTable(TableName.ConsumerSecret);
        await dropOnUpdateTrigger(knex, TableName.ConsumerSecret);
      }
    });
  }
  

