import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCATable = await knex.schema.hasTable(TableName.CertificateAuthority);
  const hasExternalCATable = await knex.schema.hasTable(TableName.ExternalCertificateAuthority);
  const hasInternalCATable = await knex.schema.hasTable(TableName.InternalCertificateAuthority);

  if (hasCATable && !hasInternalCATable) {
    await knex.schema.createTableLike(TableName.InternalCertificateAuthority, TableName.CertificateAuthority, (t) => {
      t.uuid("certificateAuthorityId").nullable();
    });

    const caRows = await knex(TableName.CertificateAuthority).select("*");
    if (caRows.length > 0) {
      // @ts-expect-error intentional: migration
      await knex(TableName.InternalCertificateAuthority).insert(caRows);
    }

    await knex(TableName.InternalCertificateAuthority).update("certificateAuthorityId", knex.ref("id"));

    await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
      t.dropColumn("projectId");
      t.dropColumn("requireTemplateForIssuance");
      t.dropColumn("createdAt");
      t.dropColumn("updatedAt");
      t.uuid("parentCaId")
        .nullable()
        .references("id")
        .inTable(TableName.CertificateAuthority)
        .onDelete("CASCADE")
        .alter();
      t.uuid("activeCaCertId").nullable().references("id").inTable(TableName.CertificateAuthorityCert).alter();
      t.uuid("certificateAuthorityId")
        .notNullable()
        .references("id")
        .inTable(TableName.CertificateAuthority)
        .onDelete("CASCADE")
        .alter();
    });

    await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
      t.dropColumn("parentCaId");
      t.dropColumn("type");
      t.dropColumn("status");
      t.dropColumn("friendlyName");
      t.dropColumn("organization");
      t.dropColumn("ou");
      t.dropColumn("country");
      t.dropColumn("province");
      t.dropColumn("locality");
      t.dropColumn("commonName");
      t.dropColumn("dn");
      t.dropColumn("serialNumber");
      t.dropColumn("maxPathLength");
      t.dropColumn("keyAlgorithm");
      t.dropColumn("notBefore");
      t.dropColumn("notAfter");
      t.dropColumn("activeCaCertId");
      t.renameColumn("requireTemplateForIssuance", "disableDirectIssuance");
    });
  }

  if (!hasExternalCATable) {
    await knex.schema.createTable(TableName.ExternalCertificateAuthority, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("type").notNullable();
      t.string("name").notNullable();
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("appConnectionId").nullable();
      t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection);
      t.uuid("dnsAppConnectionId").nullable();
      t.foreign("dnsAppConnectionId").references("id").inTable(TableName.AppConnection);
      t.uuid("certificateAuthorityId")
        .notNullable()
        .references("id")
        .inTable(TableName.CertificateAuthority)
        .onDelete("CASCADE");
      t.binary("credentials");
      t.json("configuration");
      t.string("status").notNullable();
      t.unique(["projectId", "name"]);
    });
  }

  if (await knex.schema.hasTable(TableName.PkiSubscriber)) {
    await knex.schema.alterTable(TableName.PkiSubscriber, (t) => {
      t.string("ttl").nullable().alter();
      t.string("lastOperationStatus");
      t.text("lastOperationMessage");
      t.string("lastOperationAt");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCATable = await knex.schema.hasTable(TableName.CertificateAuthority);
  const hasExternalCATable = await knex.schema.hasTable(TableName.ExternalCertificateAuthority);
  const hasInternalCATable = await knex.schema.hasTable(TableName.InternalCertificateAuthority);

  if (hasCATable && hasInternalCATable) {
    // First add all columns as nullable
    await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
      t.uuid("parentCaId").nullable().references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.string("type").nullable();
      t.string("status").nullable();
      t.string("friendlyName").nullable();
      t.string("organization").nullable();
      t.string("ou").nullable();
      t.string("country").nullable();
      t.string("province").nullable();
      t.string("locality").nullable();
      t.string("commonName").nullable();
      t.string("dn").nullable();
      t.string("serialNumber").nullable().unique();
      t.integer("maxPathLength").nullable();
      t.string("keyAlgorithm").nullable();
      t.timestamp("notBefore").nullable();
      t.timestamp("notAfter").nullable();
      t.uuid("activeCaCertId").nullable().references("id").inTable(TableName.CertificateAuthorityCert);
      t.renameColumn("disableDirectIssuance", "requireTemplateForIssuance");
    });

    await knex.raw(`
      UPDATE ${TableName.CertificateAuthority} ca
      SET
        type = ica.type,
        status = ica.status,
        "friendlyName" = ica."friendlyName",
        organization = ica.organization,
        ou = ica.ou,
        country = ica.country,
        province = ica.province,
        locality = ica.locality,
        "commonName" = ica."commonName",
        dn = ica.dn,
        "parentCaId" = ica."parentCaId",
        "serialNumber" = ica."serialNumber",
        "maxPathLength" = ica."maxPathLength",
        "keyAlgorithm" = ica."keyAlgorithm",
        "notBefore" = ica."notBefore",
        "notAfter" = ica."notAfter",
        "activeCaCertId" = ica."activeCaCertId"
      FROM ${TableName.InternalCertificateAuthority} ica
      WHERE ca.id = ica."certificateAuthorityId"
    `);

    await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
      t.string("type").notNullable().alter();
      t.string("status").notNullable().alter();
      t.string("friendlyName").notNullable().alter();
      t.string("organization").notNullable().alter();
      t.string("ou").notNullable().alter();
      t.string("country").notNullable().alter();
      t.string("province").notNullable().alter();
      t.string("locality").notNullable().alter();
      t.string("commonName").notNullable().alter();
      t.string("dn").notNullable().alter();
      t.string("keyAlgorithm").notNullable().alter();
    });

    await knex.schema.dropTable(TableName.InternalCertificateAuthority);
  }

  if (hasExternalCATable) {
    await knex.schema.dropTable(TableName.ExternalCertificateAuthority);
  }

  if (await knex.schema.hasTable(TableName.PkiSubscriber)) {
    await knex.schema.alterTable(TableName.PkiSubscriber, (t) => {
      t.dropColumn("lastOperationStatus");
      t.dropColumn("lastOperationMessage");
      t.dropColumn("lastOperationAt");
    });
  }
}
