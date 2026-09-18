import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Certificate, "orderId")) return;

  await knex.schema.alterTable(TableName.Certificate, (t) => {
    t.uuid("orderId").nullable();
  });

  await knex.raw(`ALTER TABLE "${TableName.Certificate}" ALTER COLUMN "orderId" SET DEFAULT gen_random_uuid()`);

  await knex.raw(`
    WITH RECURSIVE ranked AS (
      SELECT id, "renewedFromCertificateId",
             ROW_NUMBER() OVER (PARTITION BY "renewedFromCertificateId" ORDER BY "createdAt", id) AS sibling_rank
      FROM "${TableName.Certificate}"
    ),
    chain AS (
      SELECT c.id, COALESCE(c."orderId", gen_random_uuid()) AS "orderId"
      FROM "${TableName.Certificate}" c
      INNER JOIN ranked r ON r.id = c.id
      WHERE c."renewedFromCertificateId" IS NULL OR r.sibling_rank > 1
      UNION ALL
      SELECT c.id, chain."orderId"
      FROM "${TableName.Certificate}" c
      INNER JOIN ranked r ON r.id = c.id
      INNER JOIN chain ON c."renewedFromCertificateId" = chain.id
      WHERE r.sibling_rank = 1
    )
    UPDATE "${TableName.Certificate}" AS target
    SET "orderId" = chain."orderId"
    FROM chain
    WHERE target.id = chain.id
      AND target."orderId" IS DISTINCT FROM chain."orderId"
  `);

  await knex.raw(`UPDATE "${TableName.Certificate}" SET "orderId" = gen_random_uuid() WHERE "orderId" IS NULL`);

  await knex.raw(`ALTER TABLE "${TableName.Certificate}" ALTER COLUMN "orderId" SET NOT NULL`);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Certificate, "orderId"))) return;

  await knex.schema.alterTable(TableName.Certificate, (t) => {
    t.dropColumn("orderId");
  });
}
