import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // find any duplicate group names within organizations
  const duplicates = await knex(TableName.Groups)
    .select("orgId", "name")
    .count("* as count")
    .groupBy("orgId", "name")
    .having(knex.raw("count(*) > 1"));

  // for each set of duplicates, update all but one with a numbered suffix
  for await (const duplicate of duplicates) {
    const groups = await knex(TableName.Groups)
      .select("id", "name")
      .where({
        orgId: duplicate.orgId,
        name: duplicate.name
      })
      .orderBy("createdAt", "asc"); // keep original name for oldest group

    // skip the first (oldest) group, rename others with numbered suffix
    for (let i = 1; i < groups.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.Groups)
        .where("id", groups[i].id)
        .update({
          name: `${groups[i].name} (${i})`,

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore TS doesn't know about Knex's timestamp types
          updatedAt: new Date()
        });
    }
  }

  // add the unique constraint
  await knex.schema.alterTable(TableName.Groups, (t) => {
    t.unique(["orgId", "name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove the unique constraint
  await knex.schema.alterTable(TableName.Groups, (t) => {
    t.dropUnique(["orgId", "name"]);
  });
}
