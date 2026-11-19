import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCliVersion = await knex.schema.hasColumn(TableName.GatewayV2, "cliVersion");
  const hasCliVersionReportedAt = await knex.schema.hasColumn(TableName.GatewayV2, "cliVersionReportedAt");
  if (!hasCliVersion || !hasCliVersionReportedAt) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      // text, not a sized string: a value too wide for the column would fail the heartbeat that writes it.
      if (!hasCliVersion) t.text("cliVersion").nullable();
      // When the gateway last reported as the Infisical CLI; set with a null cliVersion, it means a CLI too old
      // to send a version. Last Seen (heartbeat, directHeartbeat) can't stand in: it records when Infisical's
      // health check last reached the gateway, so the detail page would
      // - date the version tooltip from a stale probe, or not at all after a revoke clears it,
      // - show a dash for an old CLI whose health check fails,
      // - call a healthy gateway old when a proxy rewrites its user agent,
      // - call every healthy gateway old for up to 3 minutes after this deploys, until its next heartbeat.
      if (!hasCliVersionReportedAt) t.timestamp("cliVersionReportedAt", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCliVersion = await knex.schema.hasColumn(TableName.GatewayV2, "cliVersion");
  const hasCliVersionReportedAt = await knex.schema.hasColumn(TableName.GatewayV2, "cliVersionReportedAt");
  if (hasCliVersion || hasCliVersionReportedAt) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      if (hasCliVersion) t.dropColumn("cliVersion");
      if (hasCliVersionReportedAt) t.dropColumn("cliVersionReportedAt");
    });
  }
}
