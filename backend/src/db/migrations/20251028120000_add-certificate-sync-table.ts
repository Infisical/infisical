import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateSync))) {
    await knex.schema.createTable(TableName.CertificateSync, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("pkiSyncId").notNullable();
      t.foreign("pkiSyncId").references("id").inTable(TableName.PkiSync).onDelete("CASCADE");
      t.uuid("certificateId").notNullable();
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
      t.string("syncStatus").defaultTo(CertificateSyncStatus.Pending);
      t.text("lastSyncMessage");
      t.datetime("lastSyncedAt");
      t.timestamps(true, true, true);

      // Ensure unique combination of pki sync and certificate
      t.unique(["pkiSyncId", "certificateId"]);

      t.index("pkiSyncId");
      t.index("certificateId");
      t.index("syncStatus");
    });

    await createOnUpdateTrigger(knex, TableName.CertificateSync);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.CertificateSync);
  await dropOnUpdateTrigger(knex, TableName.CertificateSync);
}
