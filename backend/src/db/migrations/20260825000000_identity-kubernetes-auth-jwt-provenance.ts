import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "isTokenReviewerJwtTemplateSourced"))) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.boolean("isTokenReviewerJwtTemplateSourced").notNullable().defaultTo(false);
    });
    // rows linked before this column existed copied their reviewer JWT from a template
    await knex(TableName.IdentityKubernetesAuth)
      .whereNotNull("templateId")
      .whereNotNull("encryptedKubernetesTokenReviewerJwt")
      .update({ isTokenReviewerJwtTemplateSourced: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "isTokenReviewerJwtTemplateSourced")) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.dropColumn("isTokenReviewerJwtTemplateSourced");
    });
  }
}
