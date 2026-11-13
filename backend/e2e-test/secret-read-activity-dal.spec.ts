import { Knex } from "knex";

import { SecretFolderRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { secretReadActivityDALFactory } from "@app/ee/services/secret-read-activity/secret-read-activity-dal";

import { createIsolatedOrgAndProject } from "./testUtils/fixtures";
import { createFolder } from "./testUtils/folders";

declare const testDb: Knex;

const secretReadActivityDAL = secretReadActivityDALFactory(testDb as never);

describe("secret read activity dal (postgres)", () => {
  let projectId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ projectId, authToken, cleanup } = await createIsolatedOrgAndProject("read-activity-dal"));
  });

  afterAll(async () => {
    await cleanup();
  });

  test("findAccessSourceDates floors an expired recursive root grant by environment and an exact one by folder", async () => {
    const app = await createFolder({ workspaceId: projectId, environmentSlug: "dev", secretPath: "/", name: "app", authToken });
    const env = await testDb(TableName.Environment).where({ projectId, slug: "dev" }).first();
    const root = await testDb(TableName.SecretFolder).where({ envId: env?.id, parentId: null }).first();
    expect(root).toBeDefined();

    const recursiveEndedAt = new Date("2026-10-01T00:00:00.000Z");
    const exactEndedAt = new Date("2026-10-02T00:00:00.000Z");
    const [recursive, exact] = await testDb(TableName.AdditionalPrivilege)
      .insert([
        {
          name: "expired recursive root grant",
          projectId,
          actorUserId: seedData1.id,
          folderId: root?.id,
          role: SecretFolderRole.Read,
          appliesToSubfolders: true,
          isTemporary: true,
          temporaryAccessEndTime: recursiveEndedAt
        },
        {
          name: "expired folder grant",
          projectId,
          actorUserId: seedData1.id,
          folderId: app.id,
          role: SecretFolderRole.Read,
          isTemporary: true,
          temporaryAccessEndTime: exactEndedAt
        }
      ])
      .returning("*");

    try {
      const dates = await secretReadActivityDAL.findAccessSourceDates(projectId, testDb);

      expect(dates.environmentReopenedAt.get(`${seedData1.id}:dev`)).toEqual(recursiveEndedAt);
      expect(dates.folderReopenedAt.get(`${seedData1.id}:${app.id}`)).toEqual(exactEndedAt);
      expect(dates.folderReopenedAt.has(`${seedData1.id}:${root?.id}`)).toBe(false);
      expect(dates.privilegeDates.has(recursive.id)).toBe(false);
      expect(dates.privilegeDates.has(exact.id)).toBe(false);
    } finally {
      await testDb(TableName.AdditionalPrivilege).whereIn("id", [recursive.id, exact.id]).del();
    }
  });
});
