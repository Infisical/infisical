import { randomUUID } from "node:crypto";

import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeProjectKeyStoreContract } from "../testing/project-key-store-contract";
import { ProjectKeyStore } from "./project-key-store";

describe("ProjectKeyStore on Postgres", () => {
  const h = setupIntegration();

  describeProjectKeyStoreContract("Postgres", async () => {
    const tenant = await h.newTenant();
    return {
      store: new ProjectKeyStore(() => h.db),
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
          found = await new ProjectKeyStore(() => trx).find(tenant.project.id);
          throw rollback;
        })
        .catch((error: unknown) => {
          if (error !== rollback) throw error;
        });

      expect(found).toBeTruthy();
    });
  });
});
