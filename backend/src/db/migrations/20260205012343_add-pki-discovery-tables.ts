import { Knex } from "knex";

import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Certificate)) {
    const hasSourceColumn = await knex.schema.hasColumn(TableName.Certificate, "source");
    if (!hasSourceColumn) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.string("source").nullable();
      });

      // Backfill: certs with a profileId were issued, others were imported
      await knex(TableName.Certificate).whereNotNull("profileId").update({ source: CertificateSource.Issued });
      await knex(TableName.Certificate).whereNull("profileId").update({ source: CertificateSource.Imported });
    }

    const hasFingerprintIndex = await knex.schema.hasColumn(TableName.Certificate, "fingerprintSha256");
    if (hasFingerprintIndex) {
      const indexExists = await knex.raw(`SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?`, [
        TableName.Certificate,
        `${TableName.Certificate}_fingerprintsha256_index`
      ]);
      if (indexExists.rows.length === 0) {
        await knex.schema.alterTable(TableName.Certificate, (t) => {
          t.index("fingerprintSha256");
        });
      }
    }

    const hasDiscoveryMetadataColumn = await knex.schema.hasColumn(TableName.Certificate, "discoveryMetadata");
    if (!hasDiscoveryMetadataColumn) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.jsonb("discoveryMetadata").nullable();
      });
    }
  }

  if (!(await knex.schema.hasTable(TableName.PkiDiscoveryConfig))) {
    await knex.schema.createTable(TableName.PkiDiscoveryConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name").notNullable();
      t.string("description").nullable();
      t.string("discoveryType").notNullable().defaultTo("network");
      t.jsonb("targetConfig").notNullable();
      t.boolean("isAutoScanEnabled").defaultTo(false).notNullable();
      t.integer("scanIntervalDays").nullable();
      t.uuid("gatewayId").nullable();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
      t.boolean("isActive").defaultTo(true).notNullable();
      t.string("lastScanStatus").nullable();
      t.string("lastScanJobId").nullable();
      t.string("lastScanMessage").nullable();
      t.datetime("lastScannedAt").nullable();
      t.timestamps(true, true, true);
      t.unique(["projectId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.PkiDiscoveryConfig);
  }

  if (!(await knex.schema.hasTable(TableName.PkiCertificateInstallation))) {
    await knex.schema.createTable(TableName.PkiCertificateInstallation, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("locationType").notNullable();
      t.jsonb("locationDetails").notNullable();
      t.string("locationFingerprint").notNullable();
      t.string("name").nullable();
      t.string("type").defaultTo("unknown").notNullable();
      t.jsonb("metadata").nullable();
      t.datetime("lastSeenAt").notNullable().defaultTo(knex.fn.now());
      t.timestamps(true, true, true);
      t.unique(["projectId", "locationFingerprint"]);
      t.index("locationFingerprint");
    });

    await createOnUpdateTrigger(knex, TableName.PkiCertificateInstallation);
  }

  if (!(await knex.schema.hasTable(TableName.PkiDiscoveryInstallation))) {
    await knex.schema.createTable(TableName.PkiDiscoveryInstallation, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("discoveryId").notNullable();
      t.foreign("discoveryId").references("id").inTable(TableName.PkiDiscoveryConfig).onDelete("CASCADE");
      t.uuid("installationId").notNullable();
      t.foreign("installationId").references("id").inTable(TableName.PkiCertificateInstallation).onDelete("CASCADE");
      t.datetime("lastScannedAt").notNullable();
      t.timestamps(true, true, true);
      t.unique(["discoveryId", "installationId"]);
    });

    await createOnUpdateTrigger(knex, TableName.PkiDiscoveryInstallation);
  }

  if (!(await knex.schema.hasTable(TableName.PkiCertificateInstallationCert))) {
    await knex.schema.createTable(TableName.PkiCertificateInstallationCert, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("installationId").notNullable();
      t.foreign("installationId").references("id").inTable(TableName.PkiCertificateInstallation).onDelete("CASCADE");
      t.uuid("certificateId").notNullable();
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
      t.datetime("firstSeenAt").notNullable();
      t.datetime("lastSeenAt").notNullable();
      t.timestamps(true, true, true);
      t.unique(["installationId", "certificateId"]);
    });

    await createOnUpdateTrigger(knex, TableName.PkiCertificateInstallationCert);
  }

  if (!(await knex.schema.hasTable(TableName.PkiDiscoveryScanHistory))) {
    await knex.schema.createTable(TableName.PkiDiscoveryScanHistory, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("discoveryConfigId").notNullable();
      t.foreign("discoveryConfigId").references("id").inTable(TableName.PkiDiscoveryConfig).onDelete("CASCADE");
      t.datetime("startedAt").notNullable();
      t.datetime("completedAt").nullable();
      t.string("status").notNullable();
      t.integer("targetsScannedCount").defaultTo(0).notNullable();
      t.integer("certificatesFoundCount").defaultTo(0).notNullable();
      t.integer("installationsFoundCount").defaultTo(0).notNullable();
      t.text("errorMessage").nullable();
      t.timestamps(true, true, true);
      t.index(["discoveryConfigId", "createdAt"]);
    });

    await createOnUpdateTrigger(knex, TableName.PkiDiscoveryScanHistory);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.PkiDiscoveryScanHistory);
  await knex.schema.dropTableIfExists(TableName.PkiDiscoveryScanHistory);

  await dropOnUpdateTrigger(knex, TableName.PkiCertificateInstallationCert);
  await knex.schema.dropTableIfExists(TableName.PkiCertificateInstallationCert);

  await dropOnUpdateTrigger(knex, TableName.PkiDiscoveryInstallation);
  await knex.schema.dropTableIfExists(TableName.PkiDiscoveryInstallation);

  await dropOnUpdateTrigger(knex, TableName.PkiCertificateInstallation);
  await knex.schema.dropTableIfExists(TableName.PkiCertificateInstallation);

  await dropOnUpdateTrigger(knex, TableName.PkiDiscoveryConfig);
  await knex.schema.dropTableIfExists(TableName.PkiDiscoveryConfig);

  if (await knex.schema.hasTable(TableName.Certificate)) {
    const indexExists = await knex.raw(`SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?`, [
      TableName.Certificate,
      `${TableName.Certificate}_fingerprintsha256_index`
    ]);

    if (indexExists.rows.length > 0) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.dropIndex("fingerprintSha256");
      });
    }

    const hasDiscoveryMetadataColumn = await knex.schema.hasColumn(TableName.Certificate, "discoveryMetadata");
    if (hasDiscoveryMetadataColumn) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.dropColumn("discoveryMetadata");
      });
    }

    const hasSourceColumn = await knex.schema.hasColumn(TableName.Certificate, "source");
    if (hasSourceColumn) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        t.dropColumn("source");
      });
    }
  }
}
