import { Knex } from "knex";

import { TableName } from "../schemas";

const NEXT_HEARTBEAT_AT_INDEX = "pam_accounts_next_heartbeat_at_index";

export async function up(knex: Knex): Promise<void> {
  const hasHeartbeatStatus = await knex.schema.hasColumn(TableName.PamAccount, "heartbeatStatus");
  const hasLastHeartbeatAt = await knex.schema.hasColumn(TableName.PamAccount, "lastHeartbeatAt");
  const hasLastHeartbeatHealthyAt = await knex.schema.hasColumn(TableName.PamAccount, "lastHeartbeatHealthyAt");
  const hasEncryptedLastHeartbeatMessage = await knex.schema.hasColumn(
    TableName.PamAccount,
    "encryptedLastHeartbeatMessage"
  );
  const hasNextHeartbeatAt = await knex.schema.hasColumn(TableName.PamAccount, "nextHeartbeatAt");

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    if (!hasHeartbeatStatus) {
      t.string("heartbeatStatus").nullable();
    }
    if (!hasLastHeartbeatAt) {
      t.timestamp("lastHeartbeatAt").nullable();
    }
    if (!hasLastHeartbeatHealthyAt) {
      t.timestamp("lastHeartbeatHealthyAt").nullable();
    }
    if (!hasEncryptedLastHeartbeatMessage) {
      t.binary("encryptedLastHeartbeatMessage").nullable();
    }
    if (!hasNextHeartbeatAt) {
      t.timestamp("nextHeartbeatAt").nullable();
      // Partial index: the finder only scans due, scheduled rows.
      t.index(["nextHeartbeatAt"], NEXT_HEARTBEAT_AT_INDEX, { predicate: knex.whereNotNull("nextHeartbeatAt") });
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasHeartbeatStatus = await knex.schema.hasColumn(TableName.PamAccount, "heartbeatStatus");
  const hasLastHeartbeatAt = await knex.schema.hasColumn(TableName.PamAccount, "lastHeartbeatAt");
  const hasLastHeartbeatHealthyAt = await knex.schema.hasColumn(TableName.PamAccount, "lastHeartbeatHealthyAt");
  const hasEncryptedLastHeartbeatMessage = await knex.schema.hasColumn(
    TableName.PamAccount,
    "encryptedLastHeartbeatMessage"
  );
  const hasNextHeartbeatAt = await knex.schema.hasColumn(TableName.PamAccount, "nextHeartbeatAt");

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    if (hasNextHeartbeatAt) {
      t.dropIndex(["nextHeartbeatAt"], NEXT_HEARTBEAT_AT_INDEX);
      t.dropColumn("nextHeartbeatAt");
    }
    if (hasEncryptedLastHeartbeatMessage) {
      t.dropColumn("encryptedLastHeartbeatMessage");
    }
    if (hasLastHeartbeatHealthyAt) {
      t.dropColumn("lastHeartbeatHealthyAt");
    }
    if (hasLastHeartbeatAt) {
      t.dropColumn("lastHeartbeatAt");
    }
    if (hasHeartbeatStatus) {
      t.dropColumn("heartbeatStatus");
    }
  });
}
