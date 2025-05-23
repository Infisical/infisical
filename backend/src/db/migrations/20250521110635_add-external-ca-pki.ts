import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCATable = await knex.schema.hasTable(TableName.CertificateAuthority);
  const hasExternalCATable = await knex.schema.hasTable(TableName.ExternalCertificateAuthority);
  const hasInternalCATable = await knex.schema.hasTable(TableName.InternalCertificateAuthority);

  if (hasCATable && !hasInternalCATable) {
    await knex.schema.createTableLike(TableName.InternalCertificateAuthority, TableName.CertificateAuthority, (t) => {
      t.uuid("caId").nullable();
    });

    // @ts-expect-error intentional: migration
    await knex(TableName.InternalCertificateAuthority).insert(knex(TableName.CertificateAuthority).select("*"));
    await knex(TableName.InternalCertificateAuthority).update("caId", knex.ref("id"));

    await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
      t.dropColumn("projectId");
      t.dropColumn("requireTemplateForIssuance");
      t.dropColumn("createdAt");
      t.dropColumn("updatedAt");
      t.dropColumn("status");
      t.uuid("parentCaId")
        .nullable()
        .references("id")
        .inTable(TableName.CertificateAuthority)
        .onDelete("CASCADE")
        .alter();
      t.uuid("activeCaCertId").nullable().references("id").inTable(TableName.CertificateAuthorityCert).alter();
      t.uuid("caId").notNullable().references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE").alter();
    });

    await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
      t.renameColumn("requireTemplateForIssuance", "enableDirectIssuance");
      t.string("name").nullable();
    });

    // prefill name for existing internal CAs and flip enableDirectIssuance
    const cas = await knex(TableName.CertificateAuthority).select("id", "friendlyName", "enableDirectIssuance");
    await Promise.all(
      cas.map((ca) => {
        const slugifiedName = ca.friendlyName
          ? slugify(`${ca.friendlyName.slice(0, 16)}-${alphaNumericNanoId(8)}`)
          : slugify(alphaNumericNanoId(12));

        return knex(TableName.CertificateAuthority)
          .where({ id: ca.id })
          .update({ name: slugifiedName, enableDirectIssuance: !ca.enableDirectIssuance });
      })
    );

    await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
      t.dropColumn("parentCaId");
      t.dropColumn("type");
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
      t.boolean("enableDirectIssuance").notNullable().defaultTo(true).alter();
      t.string("name").notNullable().alter();
      t.unique(["name", "projectId"]);
    });
  }

  if (!hasExternalCATable) {
    await knex.schema.createTable(TableName.ExternalCertificateAuthority, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("type").notNullable();
      t.uuid("appConnectionId").nullable();
      t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection);
      t.uuid("dnsAppConnectionId").nullable();
      t.foreign("dnsAppConnectionId").references("id").inTable(TableName.AppConnection);
      t.uuid("caId").notNullable().references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.binary("credentials");
      t.json("configuration");
    });
  }

  if (await knex.schema.hasTable(TableName.PkiSubscriber)) {
    await knex.schema.alterTable(TableName.PkiSubscriber, (t) => {
      t.string("ttl").nullable().alter();

      t.boolean("enableAutoRenewal").notNullable().defaultTo(false);
      t.integer("autoRenewalPeriodInDays");
      t.datetime("lastAutoRenewAt");

      t.string("lastOperationStatus");
      t.text("lastOperationMessage");
      t.dateTime("lastOperationAt");
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
      t.renameColumn("enableDirectIssuance", "requireTemplateForIssuance");
      t.dropColumn("name");
    });

    // flip requireTemplateForIssuance for existing internal CAs
    const cas = await knex(TableName.CertificateAuthority).select("id", "requireTemplateForIssuance");
    await Promise.all(
      cas.map((ca) => {
        return (
          knex(TableName.CertificateAuthority)
            .where({ id: ca.id })
            // @ts-expect-error intentional: migration
            .update({ requireTemplateForIssuance: !ca.requireTemplateForIssuance })
        );
      })
    );

    await knex.raw(`
      UPDATE ${TableName.CertificateAuthority} ca
      SET
        type = ica.type,
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
      WHERE ca.id = ica."caId"
    `);

    await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
      t.string("type").notNullable().alter();
      t.string("friendlyName").notNullable().alter();
      t.string("organization").notNullable().alter();
      t.string("ou").notNullable().alter();
      t.string("country").notNullable().alter();
      t.string("province").notNullable().alter();
      t.string("locality").notNullable().alter();
      t.string("commonName").notNullable().alter();
      t.string("dn").notNullable().alter();
      t.string("keyAlgorithm").notNullable().alter();
      t.boolean("requireTemplateForIssuance").notNullable().defaultTo(false).alter();
    });

    await knex.schema.dropTable(TableName.InternalCertificateAuthority);
  }

  if (hasExternalCATable) {
    await knex.schema.dropTable(TableName.ExternalCertificateAuthority);
  }

  if (await knex.schema.hasTable(TableName.PkiSubscriber)) {
    await knex.schema.alterTable(TableName.PkiSubscriber, (t) => {
      t.dropColumn("enableAutoRenewal");
      t.dropColumn("autoRenewalPeriodInDays");
      t.dropColumn("lastAutoRenewAt");

      t.dropColumn("lastOperationStatus");
      t.dropColumn("lastOperationMessage");
      t.dropColumn("lastOperationAt");
    });
  }
}
