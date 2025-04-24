import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasAuthConsentContentCol = await knex.schema.hasColumn(TableName.SuperAdmin, "authConsentContent");
  const hasPageFrameContentCol = await knex.schema.hasColumn(TableName.SuperAdmin, "pageFrameContent");
  if (await knex.schema.hasTable(TableName.SuperAdmin)) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      if (!hasAuthConsentContentCol) {
        t.text("authConsentContent");
      }
      if (!hasPageFrameContentCol) {
        t.text("pageFrameContent");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAuthConsentContentCol = await knex.schema.hasColumn(TableName.SuperAdmin, "authConsentContent");
  const hasPageFrameContentCol = await knex.schema.hasColumn(TableName.SuperAdmin, "pageFrameContent");
  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    if (hasAuthConsentContentCol) {
      t.dropColumn("authConsentContent");
    }
    if (hasPageFrameContentCol) {
      t.dropColumn("pageFrameContent");
    }
  });
}
