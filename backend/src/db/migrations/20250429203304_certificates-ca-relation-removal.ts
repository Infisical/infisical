import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Certificate)) {
    const hasProjectIdColumn = await knex.schema.hasColumn(TableName.Certificate, "projectId");
    if (!hasProjectIdColumn) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.string("projectId", 36).nullable();
        t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      });

      await knex.raw(`
          UPDATE "${TableName.Certificate}" cert
          SET "projectId" = ca."projectId"
          FROM "${TableName.CertificateAuthority}" ca
          WHERE cert."caId" = ca.id
        `);

      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.string("projectId").notNullable().alter();
      });
    }

    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.uuid("caId").nullable().alter();
      t.uuid("caCertId").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Certificate)) {
    if (await knex.schema.hasColumn(TableName.Certificate, "projectId")) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.dropForeign("projectId");
        t.dropColumn("projectId");
      });
    }
  }

  // Altering back to notNullable for caId and caCertId will fail
}
