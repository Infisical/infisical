import { randomUUID } from "node:crypto";

import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeOrganizationKeyStoreContract } from "../testing/organization-key-store-contract";
import { OrganizationKeyStore } from "./organization-key-store";

describe("OrganizationKeyStore on Postgres", () => {
  const h = setupIntegration();

  describeOrganizationKeyStoreContract("Postgres", async () => ({
    store: new OrganizationKeyStore(() => h.db),
    newOrg: async () => (await h.factories.organization()).id,
    newKmsKeyId: async (orgId) => {
      const [row] = await h
        .db(TableName.KmsKey)
        .insert({ orgId, name: randomUUID().slice(0, 30) })
        .returning("id");
      return row.id;
    }
  }));
});
