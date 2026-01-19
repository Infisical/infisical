import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.AiMcpEndpoint);
  if (!hasTable) {
    return;
  }

  // Add new columns
  await knex.schema.alterTable(TableName.AiMcpEndpoint, (t) => {
    t.boolean("piiRequestFiltering").defaultTo(false).notNullable();
    t.boolean("piiResponseFiltering").defaultTo(false).notNullable();
    t.specificType("piiEntityTypes", "text[]");
  });

  // Migrate existing data: if piiFiltering was true, enable both request and response filtering
  await knex(TableName.AiMcpEndpoint).where("piiFiltering", true).update({
    piiRequestFiltering: true,
    piiResponseFiltering: true
  });

  // Drop old column
  await knex.schema.alterTable(TableName.AiMcpEndpoint, (t) => {
    t.dropColumn("piiFiltering");
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.AiMcpEndpoint);
  if (!hasTable) {
    return;
  }

  // Re-add old column
  await knex.schema.alterTable(TableName.AiMcpEndpoint, (t) => {
    t.boolean("piiFiltering").defaultTo(false).notNullable();
  });

  // Migrate data back: if either request or response filtering was enabled, enable piiFiltering
  await knex(TableName.AiMcpEndpoint)
    .where((builder) => {
      void builder.where("piiRequestFiltering", true).orWhere("piiResponseFiltering", true);
    })
    .update({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - piiFiltering column exists temporarily during migration rollback
      piiFiltering: true
    });

  // Drop new columns
  await knex.schema.alterTable(TableName.AiMcpEndpoint, (t) => {
    t.dropColumn("piiRequestFiltering");
    t.dropColumn("piiResponseFiltering");
    t.dropColumn("piiEntityTypes");
  });
}
