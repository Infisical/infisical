import { Knex } from "knex";

import { TableName } from "../schemas";

const BATCH_SIZE = 1000;

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.UserAliases, "isEmailVerified"))) {
    // Add the column
    await knex.schema.alterTable(TableName.UserAliases, (t) => {
      t.boolean("isEmailVerified").defaultTo(false);
    });

    const aliasesToUpdate: { aliasId: string; isEmailVerified: boolean }[] = await knex(TableName.UserAliases)
      .join(TableName.Users, `${TableName.UserAliases}.userId`, `${TableName.Users}.id`)
      .select([`${TableName.UserAliases}.id as aliasId`, `${TableName.Users}.isEmailVerified`]);

    for (let i = 0; i < aliasesToUpdate.length; i += BATCH_SIZE) {
      const batch = aliasesToUpdate.slice(i, i + BATCH_SIZE);

      const trueIds = batch.filter((row) => row.isEmailVerified).map((row) => row.aliasId);

      if (trueIds.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await knex(TableName.UserAliases).whereIn("id", trueIds).update({ isEmailVerified: true });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.UserAliases, "isEmailVerified")) {
    await knex.schema.alterTable(TableName.UserAliases, (t) => {
      t.dropColumn("isEmailVerified");
    });
  }
}
