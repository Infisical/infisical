import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEmail = await knex.schema.hasColumn(TableName.Users, "email");
  const hasUsername = await knex.schema.hasColumn(TableName.Users, "username");
  if (hasEmail) {
    await knex(TableName.Users)
      .where({ isGhost: false })
      .update({
        // @ts-expect-error email assume string this is expected
        email: knex.raw("lower(email)")
      });
  }
  if (hasUsername) {
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS ${TableName.Users}_lower_username_idx 
      ON ${TableName.Users} (LOWER(username))
    `);

    const duplicatesSubquery = knex(TableName.Users)
      .select(knex.raw("lower(username) as lowercase_username"))
      .groupBy("lowercase_username")
      .having(knex.raw("count(*)"), ">", 1);

    // Update usernames to lowercase where they won't create duplicates
    await knex(TableName.Users)
      .where({ isGhost: false })
      .whereRaw("username <> lower(username)") // Only update if not already lowercase
      // @ts-expect-error username assume string this is expected
      .whereNotIn(knex.raw("lower(username)"), duplicatesSubquery)
      .update({
        // @ts-expect-error username assume string this is expected
        username: knex.raw("lower(username)")
      });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasUsername = await knex.schema.hasColumn(TableName.Users, "username");
  if (hasUsername) {
    await knex.schema.raw(`
  DROP INDEX IF EXISTS ${TableName.Users}_lower_username_idx
`);
  }
}
