import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.CertificateInventoryView);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.CertificateInventoryView, "isShared");
  if (hasColumn) return;

  await knex.schema.alterTable(TableName.CertificateInventoryView, (t) => {
    t.boolean("isShared").notNullable().defaultTo(false);
  });

  await knex.schema.alterTable(TableName.CertificateInventoryView, (t) => {
    t.dropUnique(["projectId", "name", "createdByUserId"]);
  });

  await knex.raw(
    `CREATE UNIQUE INDEX "cert_inv_view_personal_unique" ON "${TableName.CertificateInventoryView}" ("projectId", "name", "createdByUserId") WHERE "isShared" = false`
  );

  // Shared views: name must be unique per project
  await knex.raw(
    `CREATE UNIQUE INDEX "cert_inv_view_shared_unique" ON "${TableName.CertificateInventoryView}" ("projectId", "name") WHERE "isShared" = true`
  );
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.CertificateInventoryView);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.CertificateInventoryView, "isShared");
  if (!hasColumn) return;

  await knex.raw(`DROP INDEX IF EXISTS "cert_inv_view_personal_unique"`);
  await knex.raw(`DROP INDEX IF EXISTS "cert_inv_view_shared_unique"`);

  await knex.schema.alterTable(TableName.CertificateInventoryView, (t) => {
    t.unique(["projectId", "name", "createdByUserId"]);
  });

  await knex.schema.alterTable(TableName.CertificateInventoryView, (t) => {
    t.dropColumn("isShared");
  });
}
