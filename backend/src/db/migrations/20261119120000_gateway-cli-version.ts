import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCliVersion = await knex.schema.hasColumn(TableName.GatewayV2, "cliVersion");
  const hasCliVersionReportedAt = await knex.schema.hasColumn(TableName.GatewayV2, "cliVersionReportedAt");
  if (!hasCliVersion || !hasCliVersionReportedAt) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      // text, not a sized string: a value too wide for the column would fail the heartbeat that writes it.
      if (!hasCliVersion) t.text("cliVersion").nullable();
      // When the gateway last sent a request as the Infisical CLI. With a null cliVersion it means the CLI sent
      // `User-Agent: cli`, which releases before v0.43.131 do. The Last Seen timestamps (heartbeat,
      // directHeartbeat) can't stand in: $checkGatewayHealth writes them only when Infisical's health check
      // reaches the gateway, so using them on the gateway detail page would
      // - date the version tooltip from a stale health check, or not at all after Revoke Access clears them,
      // - show a dash, not "Older than v0.43.131", for an old CLI whose health check fails,
      // - show "Older than v0.43.131" for a current gateway behind a proxy that rewrites its User-Agent,
      // - show "Older than v0.43.131" for every healthy gateway until its next heartbeat (up to 3 minutes).
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
