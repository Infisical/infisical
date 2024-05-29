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

  if (await knex.schema.hasTable(TableName.SecretImport)) {
    await knex.schema.alterTable(TableName.SecretImport, (t) => {
      if (!doesSecretImportIsReplicationExist) t.boolean("isReplication").defaultTo(false);
      if (!doesSecretImportIsReplicationSuccessExist) t.boolean("isReplicationSuccess").nullable();
      if (!doesSecretImportReplicationStatusExist) t.text("replicationStatus").nullable();
      if (!doesSecretImportLastReplicatedExist) t.datetime("lastReplicated").nullable();
    });
  }

  const doesSecretIsReplicatedExist = await knex.schema.hasColumn(TableName.Secret, "isReplicated");
  if (await knex.schema.hasTable(TableName.Secret)) {
    await knex.schema.alterTable(TableName.Secret, (t) => {
      if (!doesSecretIsReplicatedExist) t.boolean("isReplicated");
    });
  }

  const doesSecretVersionIsReplicatedExist = await knex.schema.hasColumn(TableName.SecretVersion, "isReplicated");
  if (await knex.schema.hasTable(TableName.SecretVersion)) {
    await knex.schema.alterTable(TableName.SecretVersion, (t) => {
      if (!doesSecretVersionIsReplicatedExist) t.boolean("isReplicated");
    });
  }

  const doesSecretApprovalRequestSecretIsReplicatedExist = await knex.schema.hasColumn(
    TableName.SecretApprovalRequestSecret,
    "isReplicated"
  );
  if (await knex.schema.hasTable(TableName.SecretApprovalRequestSecret)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecret, (t) => {
      if (!doesSecretApprovalRequestSecretIsReplicatedExist) t.boolean("isReplicated");
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
  if (await knex.schema.hasTable(TableName.SecretImport)) {
    await knex.schema.alterTable(TableName.SecretImport, (t) => {
      if (doesSecretImportIsReplicationExist) t.dropColumn("isReplication");
      if (doesSecretImportIsReplicationSuccessExist) t.dropColumn("isReplicationSuccess");
      if (doesSecretImportReplicationStatusExist) t.dropColumn("replicationStatus");
      if (doesSecretImportLastReplicatedExist) t.dropColumn("lastReplicated");
    });
  }

  const doesSecretIsReplicatedExist = await knex.schema.hasColumn(TableName.Secret, "isReplicated");
  if (await knex.schema.hasTable(TableName.Secret)) {
    await knex.schema.alterTable(TableName.Secret, (t) => {
      if (doesSecretIsReplicatedExist) t.dropColumns("isReplicated");
    });
  }

  const doesSecretVersionIsReplicatedExist = await knex.schema.hasColumn(TableName.SecretVersion, "isReplicated");
  if (await knex.schema.hasTable(TableName.SecretVersion)) {
    await knex.schema.alterTable(TableName.SecretVersion, (t) => {
      if (doesSecretVersionIsReplicatedExist) t.dropColumns("isReplicated");
    });
  }

  const doesSecretApprovalRequestSecretIsReplicatedExist = await knex.schema.hasColumn(
    TableName.SecretApprovalRequestSecret,
    "isReplicated"
  );
  if (await knex.schema.hasTable(TableName.SecretApprovalRequestSecret)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecret, (t) => {
      if (doesSecretApprovalRequestSecretIsReplicatedExist) t.dropColumns("isReplicated");
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
