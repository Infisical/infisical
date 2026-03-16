/* eslint-disable no-await-in-loop, no-continue */
import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CaSigningConfig))) {
    await knex.schema.createTable(TableName.CaSigningConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("caId").notNullable().unique();
      t.foreign("caId").references("id").inTable(TableName.InternalCertificateAuthority).onDelete("CASCADE");
      t.string("type").notNullable();
      t.uuid("parentCaId").nullable();
      t.foreign("parentCaId").references("id").inTable(TableName.CertificateAuthority).onDelete("SET NULL");
      t.uuid("appConnectionId").nullable();
      t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection).onDelete("SET NULL");
      t.jsonb("destinationConfig").nullable();
      t.string("lastExternalCertificateId").nullable();
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.CaSigningConfig);

    const internalCas = await knex(TableName.InternalCertificateAuthority).select("id", "type", "parentCaId");

    for (const ca of internalCas) {
      if (ca.type === "root") continue;

      await knex(TableName.CaSigningConfig).insert({
        caId: ca.id,
        type: ca.parentCaId ? "internal" : "manual",
        ...(ca.parentCaId ? { parentCaId: ca.parentCaId } : {})
      });
    }
  }

  if (await knex.schema.hasTable(TableName.InternalCertificateAuthority)) {
    const hasAutoRenewalEnabled = await knex.schema.hasColumn(
      TableName.InternalCertificateAuthority,
      "autoRenewalEnabled"
    );
    if (!hasAutoRenewalEnabled) {
      await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
        t.boolean("autoRenewalEnabled").defaultTo(false).notNullable();
        t.integer("autoRenewalDaysBeforeExpiry").nullable();
        t.string("lastRenewalStatus").nullable();
        t.text("lastRenewalMessage").nullable();
        t.datetime("lastRenewalAt").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.InternalCertificateAuthority)) {
    const hasAutoRenewalEnabled = await knex.schema.hasColumn(
      TableName.InternalCertificateAuthority,
      "autoRenewalEnabled"
    );
    if (hasAutoRenewalEnabled) {
      await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
        t.dropColumn("autoRenewalEnabled");
        t.dropColumn("autoRenewalDaysBeforeExpiry");
        t.dropColumn("lastRenewalStatus");
        t.dropColumn("lastRenewalMessage");
        t.dropColumn("lastRenewalAt");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.CaSigningConfig)) {
    await dropOnUpdateTrigger(knex, TableName.CaSigningConfig);
    await knex.schema.dropTableIfExists(TableName.CaSigningConfig);
  }
}
