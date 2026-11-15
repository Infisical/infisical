import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { createIsolatedOrgAndProject } from "./testUtils/fixtures";
import { createFolder } from "./testUtils/folders";

declare const testDb: Knex;

const folderDAL = secretFolderDALFactory(testDb as never);

describe("secret folder dal (postgres)", () => {
  // No API can put an environment into its grace period and still read its folders, so soft-delete it directly.
  test("findSecretPathByFolderIds hides an environment pending deletion unless asked to include it", async () => {
    const { projectId, authToken, cleanup } = await createIsolatedOrgAndProject("folder-dal");
    try {
      const folder = await createFolder({
        workspaceId: projectId,
        environmentSlug: "dev",
        secretPath: "/",
        name: "app",
        authToken
      });
      await testDb(TableName.Environment).where({ projectId, slug: "dev" }).update({ deleteAfter: new Date() });

      const [hidden] = await folderDAL.findSecretPathByFolderIds(projectId, [folder.id], undefined, {
        readFromPrimary: true
      });
      expect(hidden).toBeUndefined();

      const [found] = await folderDAL.findSecretPathByFolderIds(projectId, [folder.id], undefined, {
        readFromPrimary: true,
        includePendingDeletion: true
      });
      expect(found).toMatchObject({ id: folder.id, path: "/app", environmentSlug: "dev" });
    } finally {
      await testDb(TableName.Environment).where({ projectId }).update({ deleteAfter: null });
      await cleanup();
    }
  });
});
