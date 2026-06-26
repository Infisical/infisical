import { Knex } from "knex";

import { SecretType, TableName } from "../schemas";

const MIGRATION_TIMEOUT = 60 * 3000; // 3 minutes

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`SET LOCAL statement_timeout = ${MIGRATION_TIMEOUT}`);

  const rankedSubquery = knex(TableName.SecretV2)
    .where("type", SecretType.Shared)
    .select(
      "id",
      knex.raw('ROW_NUMBER() OVER (PARTITION BY "folderId", "key" ORDER BY "updatedAt" DESC, "id" DESC) as rn')
    )
    .as("ranked_secrets");

  await knex(TableName.SecretV2)
    .whereIn("id", (qb) => {
      void qb.select("id").from(rankedSubquery).where("rn", ">", 1);
    })
    .del();
}

export async function down(): Promise<void> {}
