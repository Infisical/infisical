import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "heartbeatStatus"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.string("heartbeatStatus").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "lastHeartbeatAt"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.timestamp("lastHeartbeatAt").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "lastHeartbeatHealthyAt"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.timestamp("lastHeartbeatHealthyAt").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "encryptedLastHeartbeatMessage"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.binary("encryptedLastHeartbeatMessage").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "nextHeartbeatAt"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.timestamp("nextHeartbeatAt").nullable();
      t.index("nextHeartbeatAt");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamAccount, "nextHeartbeatAt")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropIndex("nextHeartbeatAt");
      t.dropColumn("nextHeartbeatAt");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccount, "encryptedLastHeartbeatMessage")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("encryptedLastHeartbeatMessage");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccount, "lastHeartbeatHealthyAt")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("lastHeartbeatHealthyAt");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccount, "lastHeartbeatAt")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("lastHeartbeatAt");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccount, "heartbeatStatus")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("heartbeatStatus");
    });
  }
}
