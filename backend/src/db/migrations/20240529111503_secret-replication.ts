import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesSecretImportIsReplicationExist = await knex.schema.hasColumn(TableName.SecretImport, "isReplication");
  const doesSecretImportIsReplicationSuccessExist = await knex.schema.hasColumn(
    TableName.SecretImport,
    "isReplicationSuccess"
  );
  const doesSecretImportReplicationStatusExist = await knex.schema.hasColumn(
    TableName.SecretImport,
    "replicationStatus"
  );
  const doesSecretImportLastReplicatedExist = await knex.schema.hasColumn(TableName.SecretImport, "lastReplicated");
  const doesSecretImportIsReservedExist = await knex.schema.hasColumn(TableName.SecretImport, "isReserved");

  if (await knex.schema.hasTable(TableName.SecretImport)) {
    await knex.schema.alterTable(TableName.SecretImport, (t) => {
      if (!doesSecretImportIsReplicationExist) t.boolean("isReplication").defaultTo(false);
      if (!doesSecretImportIsReplicationSuccessExist) t.boolean("isReplicationSuccess").nullable();
      if (!doesSecretImportReplicationStatusExist) t.text("replicationStatus").nullable();
      if (!doesSecretImportLastReplicatedExist) t.datetime("lastReplicated").nullable();
      if (!doesSecretImportIsReservedExist) t.boolean("isReserved").defaultTo(false);
    });
  }

  const doesSecretFolderReservedExist = await knex.schema.hasColumn(TableName.SecretFolder, "isReserved");
  if (await knex.schema.hasTable(TableName.SecretFolder)) {
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      if (!doesSecretFolderReservedExist) t.boolean("isReserved").defaultTo(false);
    });
  }

  const doesSecretApprovalRequestIsReplicatedExist = await knex.schema.hasColumn(
    TableName.SecretApprovalRequest,
    "isReplicated"
  );
  if (await knex.schema.hasTable(TableName.SecretApprovalRequest)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      if (!doesSecretApprovalRequestIsReplicatedExist) t.boolean("isReplicated");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesSecretImportIsReplicationExist = await knex.schema.hasColumn(TableName.SecretImport, "isReplication");
  const doesSecretImportIsReplicationSuccessExist = await knex.schema.hasColumn(
    TableName.SecretImport,
    "isReplicationSuccess"
  );
  const doesSecretImportReplicationStatusExist = await knex.schema.hasColumn(
    TableName.SecretImport,
    "replicationStatus"
  );
  const doesSecretImportLastReplicatedExist = await knex.schema.hasColumn(TableName.SecretImport, "lastReplicated");
  const doesSecretImportIsReservedExist = await knex.schema.hasColumn(TableName.SecretImport, "isReserved");

  if (await knex.schema.hasTable(TableName.SecretImport)) {
    await knex.schema.alterTable(TableName.SecretImport, (t) => {
      if (doesSecretImportIsReplicationExist) t.dropColumn("isReplication");
      if (doesSecretImportIsReplicationSuccessExist) t.dropColumn("isReplicationSuccess");
      if (doesSecretImportReplicationStatusExist) t.dropColumn("replicationStatus");
      if (doesSecretImportLastReplicatedExist) t.dropColumn("lastReplicated");
      if (doesSecretImportIsReservedExist) t.dropColumn("isReserved");
    });
  }

  const doesSecretFolderReservedExist = await knex.schema.hasColumn(TableName.SecretFolder, "isReserved");
  if (await knex.schema.hasTable(TableName.SecretFolder)) {
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      if (doesSecretFolderReservedExist) t.dropColumn("isReserved");
    });
  }

  const doesSecretApprovalRequestIsReplicatedExist = await knex.schema.hasColumn(
    TableName.SecretApprovalRequest,
    "isReplicated"
  );
  if (await knex.schema.hasTable(TableName.SecretApprovalRequest)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      if (doesSecretApprovalRequestIsReplicatedExist) t.dropColumn("isReplicated");
    });
  }
}
