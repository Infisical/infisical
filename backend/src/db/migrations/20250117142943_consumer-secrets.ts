import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('consumer_secrets', (table) => {
        table.uuid('id').primary();
        table.uuid('organization').notNullable();
        table.uuid('user').notNullable();
        table.binary('encrypted_data').notNullable();
    
        // Foreign Key Constraints
        table.foreign('organization').references('id').inTable('organizations').onDelete('CASCADE');
        table.foreign('user').references('id').inTable('users').onDelete('CASCADE');
    
        // Indices for faster queries
        table.index('organization');
        table.index('user');
      });
}


export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('consumer_secrets');
}

