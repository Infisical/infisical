import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

// Root org + its sub-orgs. Quotas count over the tree because plans resolve at the root, so scoping a
// counter to one org hands out the full allowance per sub-org.
export const orgTreeIds = (knex: Knex, orgId: string) => {
  const rootOrgId = knex
    .select(knex.raw(`COALESCE("rootOrgId", "id")`))
    .from(TableName.Organization)
    .where("id", orgId);

  return knex
    .select("id")
    .from(TableName.Organization)
    .where((bd) => {
      void bd.where("id", rootOrgId).orWhere("rootOrgId", rootOrgId);
    });
};
