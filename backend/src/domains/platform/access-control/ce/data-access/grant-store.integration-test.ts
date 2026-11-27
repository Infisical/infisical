import { TableName } from "@app/db/schemas";
import { poolStoreConnection } from "@app/domains/lib/data-access";
import { randomId, setupIntegration } from "@app/domains/lib/testing/integration";

import { describeGrantStoreContract, TGrantStoreFixture } from "../testing/grant-store-contract";
import { KnexGrantSeeder } from "../testing/knex-grant-seeder";
import { GrantStore } from "./grant-store";

describe("GrantStore on Postgres", () => {
  const h = setupIntegration();

  const postgresFixture = async (): Promise<TGrantStoreFixture> => ({
    store: new GrantStore(poolStoreConnection(h.db)),
    seed: new KnexGrantSeeder(h.db),
    newOrg: async () => (await h.factories.organization()).id,
    newProject: async (orgId) => (await h.factories.project({ orgId, environments: [] })).project.id,
    newUser: async () => (await h.factories.user()).id,
    newIdentity: async (orgId) => {
      const [identity] = await h
        .db(TableName.Identity)
        .insert({ name: `identity-${randomId()}`, orgId })
        .returning("id");
      return identity.id;
    },
    newFolder: async (projectId) => {
      const [environment] = await h
        .db(TableName.Environment)
        .insert({
          name: "Development",
          slug: `env-${randomId()}`,
          position: Math.floor(Math.random() * 1_000_000),
          projectId
        })
        .returning("id");
      const [folder] = await h
        .db(TableName.SecretFolder)
        .insert({ name: `folder-${randomId()}`, envId: environment.id })
        .returning("id");
      return folder.id;
    }
  });

  describeGrantStoreContract("postgres", postgresFixture);
});
