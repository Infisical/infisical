import { TableName } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { randomId, setupIntegration } from "@app/domains/lib/testing/integration";

import { buildAccessControlDataAccessDeps } from "../module";
import { describeGrantDataAccessContract } from "../testing/grant-data-access-contract";

describe("GrantDataAccess on Postgres", () => {
  const h = setupIntegration();

  describeGrantDataAccessContract("postgres", () => ({
    build: async () => buildAccessControlDataAccessDeps(DataAccessDb.fromClient(h.db)),
    newOrg: async () => (await h.factories.organization()).id,
    newProject: async (orgId) => (await h.factories.project({ orgId, environments: [] })).project.id,
    newUser: async () => (await h.factories.user()).id,
    newIdentity: async (orgId) => {
      const [identity] = await h
        .db(TableName.Identity)
        .insert({ name: `identity-${randomId()}`, orgId })
        .returning("id");
      return identity.id;
    }
  }));
});
