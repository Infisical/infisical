import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const ALTER_LOCK_TIMEOUT = 10 * 1000;

const createMicrosoftAutoenrollmentTables = async (knex: Knex) => {
  if (!(await knex.schema.hasTable(TableName.PkiMicrosoftAutoenrollmentConfig))) {
    await knex.schema.createTable(TableName.PkiMicrosoftAutoenrollmentConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("applicationProfileId").notNullable().unique();
      t.foreign("applicationProfileId").references("id").inTable(TableName.PkiApplicationProfile).onDelete("CASCADE");
      t.integer("templateMajorRevision").notNullable().defaultTo(100);
      t.integer("templateMinorRevision").notNullable().defaultTo(0);
      t.jsonb("allowedGroups").nullable();
      t.integer("renewBeforeDays").notNullable();
      t.text("servicePrincipalName").notNullable();
      t.integer("keyVersion").notNullable();
      t.binary("encryptedKeytab").notNullable();
      t.uuid("appConnectionId").notNullable();
      t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection).deferrable("deferred");
      t.index("appConnectionId");
      t.boolean("allowAnyChannelBinding").notNullable().defaultTo(false);
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiMicrosoftAutoenrollmentConfig);
  }

  if (!(await knex.schema.hasTable(TableName.PkiMicrosoftAutoenrollmentRequest))) {
    await knex.schema.createTable(TableName.PkiMicrosoftAutoenrollmentRequest, (t) => {
      t.increments("requestNumber").primary();
      t.uuid("certificateRequestId").notNullable().unique();
      t.datetime("certificateRequestCreatedAt").notNullable();
      t.foreign(["certificateRequestId", "certificateRequestCreatedAt"])
        .references(["id", "createdAt"])
        .inTable(TableName.CertificateRequests)
        .onDelete("CASCADE");
      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasColumn(TableName.PkiApplicationProfile, "microsoftAutoenrollmentConfigId"))) {
    await knex.schema.alterTable(TableName.PkiApplicationProfile, (t) => {
      t.uuid("microsoftAutoenrollmentConfigId");
      t.foreign("microsoftAutoenrollmentConfigId")
        .references("id")
        .inTable(TableName.PkiMicrosoftAutoenrollmentConfig)
        .onDelete("SET NULL");
      t.index("microsoftAutoenrollmentConfigId");
    });
  }
};

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.CertificateRequests, "renewedFromCertificateId"))) {
    await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
      await tx.schema.alterTable(TableName.CertificateRequests, (t) => {
        t.uuid("renewedFromCertificateId").nullable();
      });
    });
  }

  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    await createMicrosoftAutoenrollmentTables(tx);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.CertificateRequests, "renewedFromCertificateId")) {
    await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
      await tx.schema.alterTable(TableName.CertificateRequests, (t) => {
        t.dropColumn("renewedFromCertificateId");
      });
    });
  }

  await knex.transaction(async (tx) => {
    await tx.raw(`SET LOCAL lock_timeout = ${ALTER_LOCK_TIMEOUT}`);
    if (await tx.schema.hasColumn(TableName.PkiApplicationProfile, "microsoftAutoenrollmentConfigId")) {
      await tx.schema.alterTable(TableName.PkiApplicationProfile, (t) => {
        t.dropForeign(["microsoftAutoenrollmentConfigId"]);
        t.dropIndex("microsoftAutoenrollmentConfigId");
        t.dropColumn("microsoftAutoenrollmentConfigId");
      });
    }

    await tx.schema.dropTableIfExists(TableName.PkiMicrosoftAutoenrollmentRequest);

    if (await tx.schema.hasTable(TableName.PkiMicrosoftAutoenrollmentConfig)) {
      await tx.schema.dropTable(TableName.PkiMicrosoftAutoenrollmentConfig);
      await dropOnUpdateTrigger(tx, TableName.PkiMicrosoftAutoenrollmentConfig);
    }
  });
}

const config = { transaction: false };
export { config };
