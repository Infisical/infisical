import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.InternalCertificateAuthority)) {
    if (!(await knex.schema.hasColumn(TableName.InternalCertificateAuthority, "crlValidityDays"))) {
      await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
        t.integer("crlValidityDays").defaultTo(7).notNullable();
      });
    }
  }

  if (await knex.schema.hasTable(TableName.CertificateAuthorityCrl)) {
    const hasThisUpdate = await knex.schema.hasColumn(TableName.CertificateAuthorityCrl, "thisUpdate");
    const hasNextUpdate = await knex.schema.hasColumn(TableName.CertificateAuthorityCrl, "nextUpdate");
    const hasCrlNumber = await knex.schema.hasColumn(TableName.CertificateAuthorityCrl, "crlNumber");

    await knex.schema.alterTable(TableName.CertificateAuthorityCrl, (t) => {
      if (!hasThisUpdate) t.timestamp("thisUpdate", { useTz: true });
      if (!hasNextUpdate) t.timestamp("nextUpdate", { useTz: true });
      if (!hasCrlNumber) t.bigInteger("crlNumber").defaultTo(1).notNullable();
    });

    await knex(TableName.CertificateAuthorityCrl).whereNull("thisUpdate").update("thisUpdate", knex.ref("updatedAt"));
    await knex(TableName.CertificateAuthorityCrl)
      .whereNull("nextUpdate")
      .update("nextUpdate", knex.raw(`?? + interval '7 days'`, ["updatedAt"]));

    await knex.schema.alterTable(TableName.CertificateAuthorityCrl, (t) => {
      t.timestamp("thisUpdate", { useTz: true }).notNullable().defaultTo(knex.fn.now()).alter();
      t.timestamp("nextUpdate", { useTz: true }).notNullable().defaultTo(knex.fn.now()).alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthorityCrl)) {
    const hasThisUpdate = await knex.schema.hasColumn(TableName.CertificateAuthorityCrl, "thisUpdate");
    const hasNextUpdate = await knex.schema.hasColumn(TableName.CertificateAuthorityCrl, "nextUpdate");
    const hasCrlNumber = await knex.schema.hasColumn(TableName.CertificateAuthorityCrl, "crlNumber");

    await knex.schema.alterTable(TableName.CertificateAuthorityCrl, (t) => {
      if (hasThisUpdate) t.dropColumn("thisUpdate");
      if (hasNextUpdate) t.dropColumn("nextUpdate");
      if (hasCrlNumber) t.dropColumn("crlNumber");
    });
  }

  if (await knex.schema.hasTable(TableName.InternalCertificateAuthority)) {
    if (await knex.schema.hasColumn(TableName.InternalCertificateAuthority, "crlValidityDays")) {
      await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
        t.dropColumn("crlValidityDays");
      });
    }
  }
}
