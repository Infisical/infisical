import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamSession)) {
    await knex.schema.alterTable(TableName.PamSession, (t) => {
      if (!t.specificType) {
        // knex types do not expose hasColumn on builder — guard via schema inspection
      }
      t.uuid("resourceId").nullable();
      t.foreign("resourceId").references("id").inTable(TableName.PamResource).onDelete("SET NULL");
      t.binary("encryptedAiInsights").nullable();
      t.string("aiInsightsStatus").nullable();
      t.text("aiInsightsError").nullable();
    });

    // Back-fill resourceId from the account → resource relation for existing sessions
    await knex.raw(`
      UPDATE ${TableName.PamSession} s
      SET "resourceId" = a."resourceId"
      FROM ${TableName.PamAccount} a
      WHERE s."accountId" = a.id
        AND s."resourceId" IS NULL
    `);
  }

  if (await knex.schema.hasTable(TableName.PamResource)) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.binary("encryptedSessionSummaryConfig").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamSession)) {
    await knex.schema.alterTable(TableName.PamSession, (t) => {
      t.dropForeign(["resourceId"]);
      t.dropColumn("resourceId");
      t.dropColumn("encryptedAiInsights");
      t.dropColumn("aiInsightsStatus");
      t.dropColumn("aiInsightsError");
    });
  }

  if (await knex.schema.hasTable(TableName.PamResource)) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.dropColumn("encryptedSessionSummaryConfig");
    });
  }
}
