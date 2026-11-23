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
      // `User-Agent: cli`, which releases before v0.43.131 do. See getCliVersionFields in gateway-v2-service.ts
      // for why heartbeat and directHeartbeat can't stand in for it.
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
