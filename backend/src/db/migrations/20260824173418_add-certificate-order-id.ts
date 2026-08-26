import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Certificate, "orderId")) return;

  await knex.schema.alterTable(TableName.Certificate, (t) => {
    t.uuid("orderId").notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    t.index("orderId");
  });

  await knex.raw(`
    WITH RECURSIVE chain AS (
      SELECT id, "orderId"
      FROM "${TableName.Certificate}"
      WHERE "renewedFromCertificateId" IS NULL
      UNION ALL
      SELECT c.id, chain."orderId"
      FROM "${TableName.Certificate}" c
      INNER JOIN chain ON c."renewedFromCertificateId" = chain.id
    )
    UPDATE "${TableName.Certificate}" AS target
    SET "orderId" = chain."orderId"
    FROM chain
    WHERE target.id = chain.id
      AND target."orderId" <> chain."orderId"
  `);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Certificate, "orderId"))) return;

  await knex.schema.alterTable(TableName.Certificate, (t) => {
    t.dropColumn("orderId");
  });
}
