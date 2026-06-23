import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

const HSM_CONNECTORS_GATEWAY_XOR_CHK = "hsm_connectors_gateway_xor_chk";
const CERTS_KEY_SOURCE_CHK = "certificates_key_source_chk";
const CERTS_HSM_CONNECTOR_FK = "certificates_hsmconnectorid_foreign";
const CERTS_HSM_CONNECTOR_IDX = "certificates_hsmconnectorid_idx";
const GATEWAYS_CAPABILITIES_GIN_IDX = "gateways_v2_capabilities_gin_idx";
const ISSUANCE_JOBS_HSM_CONNECTOR_IDX = "pki_signer_issuance_jobs_hsm_connector_idx";

const indexExists = async (knex: Knex, indexName: string): Promise<boolean> => {
  const result = await knex.raw(`SELECT 1 FROM pg_indexes WHERE indexname = ?`, [indexName]);
  return result.rows.length > 0;
};

const constraintExists = async (knex: Knex, table: string, constraintName: string): Promise<boolean> => {
  const result = await knex.raw(
    `SELECT 1 FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = ? AND c.conname = ?`,
    [table, constraintName]
  );
  return result.rows.length > 0;
};

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.HsmConnector))) {
    await knex.schema.createTable(TableName.HsmConnector, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 32).notNullable();
      t.string("description", 256);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      // Exactly one of gatewayId / gatewayPoolId is set (enforced by the XOR check below).
      t.uuid("gatewayId").nullable();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("RESTRICT");
      t.uuid("gatewayPoolId").nullable();
      t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("RESTRICT");

      t.binary("encryptedCredentials").notNullable();

      t.timestamps(true, true, true);

      t.unique(["projectId", "name"]);
      t.index(["gatewayId"]);
      t.index(["gatewayPoolId"]);
    });

    await knex.raw(
      `
      ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (
        ("gatewayId" IS NOT NULL AND "gatewayPoolId" IS NULL)
        OR
        ("gatewayId" IS NULL AND "gatewayPoolId" IS NOT NULL)
      )
    `,
      [TableName.HsmConnector, HSM_CONNECTORS_GATEWAY_XOR_CHK]
    );

    await createOnUpdateTrigger(knex, TableName.HsmConnector);
  }

  if (await knex.schema.hasTable(TableName.Certificate)) {
    const hasKeySource = await knex.schema.hasColumn(TableName.Certificate, "keySource");
    const hasHsmConnectorId = await knex.schema.hasColumn(TableName.Certificate, "hsmConnectorId");
    const hasHsmKeyLabel = await knex.schema.hasColumn(TableName.Certificate, "hsmKeyLabel");
    const hasHsmPublicKeySpki = await knex.schema.hasColumn(TableName.Certificate, "hsmPublicKeySpki");

    if (!hasKeySource || !hasHsmConnectorId || !hasHsmKeyLabel || !hasHsmPublicKeySpki) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        if (!hasKeySource) {
          t.string("keySource", 32).notNullable().defaultTo("infisical");
        }
        if (!hasHsmConnectorId) {
          t.uuid("hsmConnectorId").nullable();
          t.foreign("hsmConnectorId", CERTS_HSM_CONNECTOR_FK)
            .references("id")
            .inTable(TableName.HsmConnector)
            .onDelete("RESTRICT");
          t.index(["hsmConnectorId"], CERTS_HSM_CONNECTOR_IDX, { predicate: knex.whereNotNull("hsmConnectorId") });
        }
        if (!hasHsmKeyLabel) {
          t.string("hsmKeyLabel", 128).nullable();
        }
        if (!hasHsmPublicKeySpki) {
          t.binary("hsmPublicKeySpki").nullable();
        }
      });
    }

    if (!(await constraintExists(knex, TableName.Certificate, CERTS_KEY_SOURCE_CHK))) {
      await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (
          ("keySource" = 'infisical')
          OR
          ("keySource" = 'hsm' AND "hsmConnectorId" IS NOT NULL AND "hsmKeyLabel" IS NOT NULL)
        ) NOT VALID`,
        [TableName.Certificate, CERTS_KEY_SOURCE_CHK]
      );
      await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [TableName.Certificate, CERTS_KEY_SOURCE_CHK]);
    }
  }

  if (await knex.schema.hasTable(TableName.GatewayV2)) {
    if (!(await knex.schema.hasColumn(TableName.GatewayV2, "capabilities"))) {
      await knex.schema.alterTable(TableName.GatewayV2, (t) => {
        t.jsonb("capabilities");
      });
    }
    if (!(await indexExists(knex, GATEWAYS_CAPABILITIES_GIN_IDX))) {
      await knex.raw(`CREATE INDEX ?? ON ?? USING gin ("capabilities")`, [
        GATEWAYS_CAPABILITIES_GIN_IDX,
        TableName.GatewayV2
      ]);
    }
  }

  if (await knex.schema.hasTable(TableName.PkiSignerCertificateIssuanceJobs)) {
    const hasKeySource = await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "keySource");
    const hasHsmConnectorId = await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "hsmConnectorId");
    const hasHsmKeyLabel = await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "hsmKeyLabel");
    const hasHsmPublicKeySpki = await knex.schema.hasColumn(
      TableName.PkiSignerCertificateIssuanceJobs,
      "hsmPublicKeySpki"
    );

    if (!hasKeySource || !hasHsmConnectorId || !hasHsmKeyLabel || !hasHsmPublicKeySpki) {
      await knex.schema.alterTable(TableName.PkiSignerCertificateIssuanceJobs, (t) => {
        if (!hasKeySource) {
          t.string("keySource", 32).notNullable().defaultTo("infisical");
        }
        if (!hasHsmConnectorId) {
          t.uuid("hsmConnectorId").nullable();
          t.foreign("hsmConnectorId").references("id").inTable(TableName.HsmConnector).onDelete("SET NULL");
          t.index(["hsmConnectorId"], ISSUANCE_JOBS_HSM_CONNECTOR_IDX, {
            predicate: knex.whereNotNull("hsmConnectorId")
          });
        }
        if (!hasHsmKeyLabel) {
          t.string("hsmKeyLabel", 128).nullable();
        }
        if (!hasHsmPublicKeySpki) {
          t.binary("hsmPublicKeySpki").nullable();
        }
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiSignerCertificateIssuanceJobs)) {
    const hasKeySource = await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "keySource");
    const hasHsmConnectorId = await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "hsmConnectorId");
    const hasHsmKeyLabel = await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "hsmKeyLabel");
    const hasHsmPublicKeySpki = await knex.schema.hasColumn(
      TableName.PkiSignerCertificateIssuanceJobs,
      "hsmPublicKeySpki"
    );
    if (hasKeySource || hasHsmConnectorId || hasHsmKeyLabel || hasHsmPublicKeySpki) {
      await knex.schema.alterTable(TableName.PkiSignerCertificateIssuanceJobs, (t) => {
        if (hasHsmPublicKeySpki) t.dropColumn("hsmPublicKeySpki");
        if (hasHsmKeyLabel) t.dropColumn("hsmKeyLabel");
        if (hasHsmConnectorId) t.dropColumn("hsmConnectorId");
        if (hasKeySource) t.dropColumn("keySource");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.GatewayV2)) {
    if (await indexExists(knex, GATEWAYS_CAPABILITIES_GIN_IDX)) {
      await knex.raw(`DROP INDEX ??`, [GATEWAYS_CAPABILITIES_GIN_IDX]);
    }
    if (await knex.schema.hasColumn(TableName.GatewayV2, "capabilities")) {
      await knex.schema.alterTable(TableName.GatewayV2, (t) => {
        t.dropColumn("capabilities");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.Certificate)) {
    if (await constraintExists(knex, TableName.Certificate, CERTS_KEY_SOURCE_CHK)) {
      await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT ??`, [TableName.Certificate, CERTS_KEY_SOURCE_CHK]);
    }
    const hasKeySource = await knex.schema.hasColumn(TableName.Certificate, "keySource");
    const hasHsmConnectorId = await knex.schema.hasColumn(TableName.Certificate, "hsmConnectorId");
    const hasHsmKeyLabel = await knex.schema.hasColumn(TableName.Certificate, "hsmKeyLabel");
    const hasHsmPublicKeySpki = await knex.schema.hasColumn(TableName.Certificate, "hsmPublicKeySpki");
    if (hasKeySource || hasHsmConnectorId || hasHsmKeyLabel || hasHsmPublicKeySpki) {
      await knex.schema.alterTable(TableName.Certificate, (t) => {
        if (hasHsmPublicKeySpki) t.dropColumn("hsmPublicKeySpki");
        if (hasHsmKeyLabel) t.dropColumn("hsmKeyLabel");
        if (hasHsmConnectorId) {
          t.dropColumn("hsmConnectorId");
        }
        if (hasKeySource) t.dropColumn("keySource");
      });
    }
  }

  await dropOnUpdateTrigger(knex, TableName.HsmConnector);
  await knex.schema.dropTableIfExists(TableName.HsmConnector);
}
