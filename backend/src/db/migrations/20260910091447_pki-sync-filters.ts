import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasFilters = await knex.schema.hasColumn(TableName.PkiSync, "filters");

  if (!hasFilters) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      t.jsonb("filters").nullable();
    });
  }

  await knex.raw(`
    UPDATE "${TableName.PkiSync}" AS s
    SET "filters" = jsonb_build_object(
      'certificateOrderIds',
      COALESCE(
        (
          SELECT jsonb_agg(DISTINCT c."orderId")
          FROM "${TableName.CertificateSync}" cs
          JOIN "${TableName.Certificate}" c ON c.id = cs."certificateId"
          WHERE cs."pkiSyncId" = s.id
        ),
        '[]'::jsonb
      )
    )
    WHERE s."filters" IS NULL AND s."applicationId" IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasFilters = await knex.schema.hasColumn(TableName.PkiSync, "filters");
  if (hasFilters) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      t.dropColumn("filters");
    });
  }
}
