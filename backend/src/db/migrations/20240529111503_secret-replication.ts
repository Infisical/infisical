import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretImport)) {
    await knex.schema.alterTable(TableName.SecretImport, (t) => {
      t.boolean("isReplication").defaultTo(false);
      t.boolean("isReplicationSuccess").nullable();
      t.text("replicationStatus").nullable();
      t.datetime("lastReplicated").nullable();
    });
  }

  if (await knex.schema.hasTable(TableName.Secret)) {
    await knex.schema.alterTable(TableName.Secret, (t) => {
      t.boolean("isReplicated");
    });
  }

  if (await knex.schema.hasTable(TableName.SecretVersion)) {
    await knex.schema.alterTable(TableName.SecretVersion, (t) => {
      t.boolean("isReplicated");
    });
  }

  if (await knex.schema.hasTable(TableName.SecretApprovalRequestSecret)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecret, (t) => {
      t.boolean("isReplicated");
    });
  }

  if (await knex.schema.hasTable(TableName.SecretApprovalRequest)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      t.boolean("isReplicated");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretImport)) {
    await knex.schema.alterTable(TableName.SecretImport, (t) => {
      t.dropColumns("isReplication");
      t.dropColumns("isReplicationSuccess");
      t.dropColumns("replicationStatus");
      t.dropColumns("lastReplicated");
    });
  }

  if (await knex.schema.hasTable(TableName.Secret)) {
    await knex.schema.alterTable(TableName.Secret, (t) => {
      t.dropColumns("isReplicated");
    });
  }

  if (await knex.schema.hasTable(TableName.SecretVersion)) {
    await knex.schema.alterTable(TableName.SecretVersion, (t) => {
      t.dropColumns("isReplicated");
    });
  }

  if (await knex.schema.hasTable(TableName.SecretApprovalRequestSecret)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecret, (t) => {
      t.dropColumns("isReplicated");
    });
  }

  if (await knex.schema.hasTable(TableName.SecretApprovalRequest)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (t) => {
      t.dropColumn("isReplicated");
    });
  }
}
