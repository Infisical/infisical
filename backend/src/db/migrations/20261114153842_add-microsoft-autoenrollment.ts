import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiMicrosoftAutoenrollmentConfig))) {
    await knex.schema.createTable(TableName.PkiMicrosoftAutoenrollmentConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("applicationProfileId").notNullable().unique();
      t.foreign("applicationProfileId").references("id").inTable(TableName.PkiApplicationProfile).onDelete("CASCADE");
      t.integer("templateMajorRevision").notNullable().defaultTo(100);
      t.integer("templateMinorRevision").notNullable().defaultTo(0);
      t.specificType("allowedGroupSids", "text[]").nullable();
      t.jsonb("allowedGroupNames").nullable();
      t.integer("renewBeforeDays").notNullable();
      t.text("servicePrincipalName").notNullable();
      t.integer("keyVersion").notNullable();
      t.binary("encryptedKeytab").notNullable();
      t.uuid("appConnectionId").notNullable();
      t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection).deferrable("deferred");
      t.index("appConnectionId");
      t.text("mismatchedServicePrincipalName").nullable();
      t.timestamp("mismatchFirstSeenAt", { useTz: true }).nullable();
      t.integer("mismatchRequestCount").notNullable().defaultTo(0);
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiMicrosoftAutoenrollmentConfig);
  }

  if (!(await knex.schema.hasTable(TableName.PkiMicrosoftAutoenrollmentRequest))) {
    await knex.schema.createTable(TableName.PkiMicrosoftAutoenrollmentRequest, (t) => {
      t.increments("requestNumber").primary();
      t.uuid("certificateRequestId").notNullable().unique();
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
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PkiApplicationProfile, "microsoftAutoenrollmentConfigId")) {
    await knex.schema.alterTable(TableName.PkiApplicationProfile, (t) => {
      t.dropForeign(["microsoftAutoenrollmentConfigId"]);
      t.dropIndex("microsoftAutoenrollmentConfigId");
      t.dropColumn("microsoftAutoenrollmentConfigId");
    });
  }

  await knex.schema.dropTableIfExists(TableName.PkiMicrosoftAutoenrollmentRequest);

  if (await knex.schema.hasTable(TableName.PkiMicrosoftAutoenrollmentConfig)) {
    await knex.schema.dropTable(TableName.PkiMicrosoftAutoenrollmentConfig);
    await dropOnUpdateTrigger(knex, TableName.PkiMicrosoftAutoenrollmentConfig);
  }
}
