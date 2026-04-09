import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamSession)) {
    const hasResourceId = await knex.schema.hasColumn(TableName.PamSession, "resourceId");
    const hasEncryptedAiInsights = await knex.schema.hasColumn(TableName.PamSession, "encryptedAiInsights");
    const hasAiInsightsStatus = await knex.schema.hasColumn(TableName.PamSession, "aiInsightsStatus");
    const hasAiInsightsError = await knex.schema.hasColumn(TableName.PamSession, "aiInsightsError");

    await knex.schema.alterTable(TableName.PamSession, (t) => {
      if (!hasResourceId) {
        t.uuid("resourceId").nullable();
        t.foreign("resourceId").references("id").inTable(TableName.PamResource).onDelete("SET NULL");
      }
      if (!hasEncryptedAiInsights) t.binary("encryptedAiInsights").nullable();
      if (!hasAiInsightsStatus) t.string("aiInsightsStatus").nullable();
      if (!hasAiInsightsError) t.text("aiInsightsError").nullable();
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
    const hasEncryptedSessionSummaryConfig = await knex.schema.hasColumn(
      TableName.PamResource,
      "encryptedSessionSummaryConfig"
    );
    if (!hasEncryptedSessionSummaryConfig) {
      await knex.schema.alterTable(TableName.PamResource, (t) => {
        t.binary("encryptedSessionSummaryConfig").nullable();
      });
    }
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
