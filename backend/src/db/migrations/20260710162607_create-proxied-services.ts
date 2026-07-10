import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.OrgAgentProxyConfig))) {
    await knex.schema.createTable(TableName.OrgAgentProxyConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("rootCaKeyAlgorithm").notNullable();
      t.datetime("rootCaIssuedAt").notNullable();
      t.datetime("rootCaExpiration").notNullable();
      t.string("rootCaSerialNumber").notNullable();
      t.binary("encryptedRootCaCertificate").notNullable();
      t.binary("encryptedRootCaPrivateKey").notNullable();

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.unique("orgId");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.OrgAgentProxyConfig);
  }

  if (!(await knex.schema.hasTable(TableName.ProxiedService))) {
    await knex.schema.createTable(TableName.ProxiedService, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("name").notNullable();
      t.string("hostPattern").notNullable();
      t.boolean("isEnabled").notNullable().defaultTo(true);

      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");

      t.unique(["folderId", "name"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ProxiedService);
  }

  if (!(await knex.schema.hasTable(TableName.ProxiedServiceCredential))) {
    await knex.schema.createTable(TableName.ProxiedServiceCredential, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("serviceId").notNullable();
      t.foreign("serviceId").references("id").inTable(TableName.ProxiedService).onDelete("CASCADE");
      t.index("serviceId");

      t.string("secretKey").notNullable();
      t.string("role").notNullable();

      t.string("headerName");
      t.string("headerPrefix");
      t.string("headerPurpose");

      t.string("placeholderKey");
      t.string("placeholderValue");
      t.specificType("substitutionSurfaces", "text[]");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ProxiedServiceCredential);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProxiedServiceCredential);
  await dropOnUpdateTrigger(knex, TableName.ProxiedServiceCredential);

  await knex.schema.dropTableIfExists(TableName.ProxiedService);
  await dropOnUpdateTrigger(knex, TableName.ProxiedService);

  await knex.schema.dropTableIfExists(TableName.OrgAgentProxyConfig);
  await dropOnUpdateTrigger(knex, TableName.OrgAgentProxyConfig);
}
