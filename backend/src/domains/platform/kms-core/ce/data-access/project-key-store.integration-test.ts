import { randomUUID } from "node:crypto";

import { TableName } from "@app/db/schemas";
import { poolStoreConnection, ReadFrom, singleStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeProjectKeyStoreContract } from "../testing/project-key-store-contract";
import { ProjectKeyStore } from "./project-key-store";

describe("ProjectKeyStore on Postgres", () => {
  const h = setupIntegration();

  describeProjectKeyStoreContract("Postgres", async () => {
    const tenant = await h.newTenant();
    return {
      store: new ProjectKeyStore(poolStoreConnection(h.db)),
      newProject: async () => {
        const { project } = await h.factories.project({ orgId: tenant.org.id });
        return { projectId: project.id, orgId: project.orgId };
      },
      newKmsKeyId: async (orgId) => {
        const [row] = await h
          .db(TableName.KmsKey)
          .insert({ orgId, name: randomUUID().slice(0, 30) })
          .returning("id");
        return row.id;
      },
      scheduleDeletion: async (projectId) => {
        await h.db(TableName.Project).where({ id: projectId }).update({ deleteAfter: new Date() });
      }
    };
  });

  describe("read routing", () => {
    test("should not touch the replica for a read from the primary", async () => {
      const tenant = await h.newTenant();
      const store = new ProjectKeyStore(
        poolStoreConnection(h.db, () => {
          throw new Error("replica used");
        })
      );

      const found = await store.find(tenant.project.id, { readFrom: ReadFrom.Primary });
      const referenced = await store.referencesKey(randomUUID(), { readFrom: ReadFrom.Primary });

      expect(found?.projectId).toBe(tenant.project.id);
      expect(referenced).toBe(false);
    });

    test("should read from the replica by default", async () => {
      const tenant = await h.newTenant();
      const replica = vi.fn(() => h.db);
      const store = new ProjectKeyStore(poolStoreConnection(h.db, replica));

      await store.find(tenant.project.id);

      expect(replica).toHaveBeenCalled();
    });
  });

  describe("before projects.deleteAfter exists", () => {
    afterEach(() => ProjectKeyStore.resetColumnProbe());

    test("should find a project when the soft delete column has not been created yet", async () => {
      const tenant = await h.newTenant();
      ProjectKeyStore.resetColumnProbe();
      const rollback = new Error("rollback");
      let found: unknown = null;

      await h.db
        .transaction(async (trx) => {
          await trx.schema.alterTable(TableName.Project, (t) => t.dropColumn("deleteAfter"));
          found = await new ProjectKeyStore(singleStoreConnection(trx)).find(tenant.project.id);
          throw rollback;
        })
        .catch((error: unknown) => {
          if (error !== rollback) throw error;
        });

      expect(found).toBeTruthy();
    });
  });
});
