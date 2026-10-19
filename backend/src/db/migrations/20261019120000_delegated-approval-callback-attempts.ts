import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCallbackAttempts = await knex.schema.hasColumn(TableName.DelegatedApprovalRequests, "callbackAttempts");

  await knex.schema.alterTable(TableName.DelegatedApprovalRequests, (t) => {
    if (!hasCallbackAttempts) {
      t.integer("callbackAttempts").notNullable().defaultTo(0);
    }
    t.index(["providerRequestId"], "delegated_approval_requests_provider_request_id_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasCallbackAttempts = await knex.schema.hasColumn(TableName.DelegatedApprovalRequests, "callbackAttempts");

  await knex.schema.alterTable(TableName.DelegatedApprovalRequests, (t) => {
    t.dropIndex(["providerRequestId"], "delegated_approval_requests_provider_request_id_idx");
    if (hasCallbackAttempts) {
      t.dropColumn("callbackAttempts");
    }
  });
}
