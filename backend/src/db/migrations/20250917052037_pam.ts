import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // PAM Folders
  if (!(await knex.schema.hasTable(TableName.PamFolder))) {
    await knex.schema.createTable(TableName.PamFolder, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.uuid("parentId").nullable();
      t.foreign("parentId").references("id").inTable(TableName.PamFolder).onDelete("CASCADE");
      t.index("parentId");

      t.string("name").notNullable();
      t.index("name");
      t.text("description").nullable();

      t.timestamps(true, true, true);
    });
  }

  // PAM Resources
  if (!(await knex.schema.hasTable(TableName.PamResource))) {
    await knex.schema.createTable(TableName.PamResource, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.string("name").notNullable();
      t.index("name");
      t.string("gatewayId").notNullable();
      t.index("gatewayId");
      t.string("resourceType").notNullable();
      t.index("resourceType");
      t.binary("encryptedConnectionDetails").notNullable();

      t.timestamps(true, true, true);
    });
  }

  // PAM Accounts
  if (!(await knex.schema.hasTable(TableName.PamAccount))) {
    await knex.schema.createTable(TableName.PamAccount, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.uuid("folderId").nullable();
      t.foreign("folderId").references("id").inTable(TableName.PamFolder).onDelete("CASCADE");
      t.index("folderId");

      t.uuid("resourceId").notNullable();
      t.foreign("resourceId").references("id").inTable(TableName.PamResource).onDelete("CASCADE");
      t.index("resourceId");

      t.string("name").notNullable();
      t.index("name");
      t.text("description").nullable();

      t.binary("encryptedCredentials").notNullable();

      t.timestamps(true, true, true);
    });
  }

  // PAM Sessions
  if (!(await knex.schema.hasTable(TableName.PamSession))) {
    await knex.schema.createTable(TableName.PamSession, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.uuid("accountId").nullable();
      t.foreign("accountId").references("id").inTable(TableName.PamAccount).onDelete("SET NULL");
      t.index("accountId");

      // To be used in the event of an account deletion
      t.string("resourceType").notNullable();
      t.string("resourceName").notNullable();
      t.string("accountName").notNullable();

      t.uuid("userId").nullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.index("userId");

      // To be used in the event of user deletion
      t.string("actorName").notNullable();
      t.string("actorEmail").notNullable();

      t.string("actorIp").notNullable();
      t.string("actorUserAgent").notNullable();

      t.string("status").notNullable();
      t.index("status");

      t.binary("encryptedLogsBlob").nullable();

      t.datetime("expiresAt").nullable(); // null means unlimited duration / no expiry

      t.datetime("startedAt").nullable(); // Not when the row is created, but when the end-to-end connection between user and resource is established
      t.datetime("endedAt").nullable();
      t.index(["startedAt", "endedAt"]);

      t.timestamps(true, true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PamSession);
  await knex.schema.dropTableIfExists(TableName.PamAccount);
  await knex.schema.dropTableIfExists(TableName.PamResource);
  await knex.schema.dropTableIfExists(TableName.PamFolder);
}
