import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasFailingSince = await knex.schema.hasColumn(TableName.AuditLogStream, "failingSince");
  const hasLastDeliveryError = await knex.schema.hasColumn(TableName.AuditLogStream, "lastDeliveryError");

  if (!hasFailingSince || !hasLastDeliveryError) {
    await knex.schema.alterTable(TableName.AuditLogStream, (t) => {
      if (!hasFailingSince) t.timestamp("failingSince", { useTz: true }).nullable();
      if (!hasLastDeliveryError) t.text("lastDeliveryError").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasFailingSince = await knex.schema.hasColumn(TableName.AuditLogStream, "failingSince");
  const hasLastDeliveryError = await knex.schema.hasColumn(TableName.AuditLogStream, "lastDeliveryError");

  if (hasFailingSince || hasLastDeliveryError) {
    await knex.schema.alterTable(TableName.AuditLogStream, (t) => {
      if (hasFailingSince) t.dropColumn("failingSince");
      if (hasLastDeliveryError) t.dropColumn("lastDeliveryError");
    });
  }
}
