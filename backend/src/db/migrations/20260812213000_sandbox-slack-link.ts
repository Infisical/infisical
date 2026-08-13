import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasChannel = await knex.schema.hasColumn(TableName.Sandbox, "slackChannelId");
  const hasThread = await knex.schema.hasColumn(TableName.Sandbox, "slackThreadTs");

  if (!hasChannel || !hasThread) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      // Which Slack conversation drives this sandbox. Inbound events resolve a sandbox by
      // (channel, thread) so a thread and its parent channel can address different sandboxes.
      if (!hasChannel) t.string("slackChannelId");
      if (!hasThread) t.string("slackThreadTs");
    });

    // Inbound Slack events look a sandbox up on every message, so the lookup needs an index.
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      t.index(["slackChannelId", "slackThreadTs"], "sandboxes_slack_conversation_idx");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasChannel = await knex.schema.hasColumn(TableName.Sandbox, "slackChannelId");
  const hasThread = await knex.schema.hasColumn(TableName.Sandbox, "slackThreadTs");

  if (hasChannel || hasThread) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      t.dropIndex(["slackChannelId", "slackThreadTs"], "sandboxes_slack_conversation_idx");
      if (hasChannel) t.dropColumn("slackChannelId");
      if (hasThread) t.dropColumn("slackThreadTs");
    });
  }
}
