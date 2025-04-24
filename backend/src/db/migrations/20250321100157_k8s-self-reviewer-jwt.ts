import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasReviewerJwtCol = await knex.schema.hasColumn(
    TableName.IdentityKubernetesAuth,
    "encryptedKubernetesTokenReviewerJwt"
  );
  if (hasReviewerJwtCol) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.binary("encryptedKubernetesTokenReviewerJwt").nullable().alter();
    });
  }
}

export async function down(): Promise<void> {
  // we can't make it back to non nullable, it will fail
}
