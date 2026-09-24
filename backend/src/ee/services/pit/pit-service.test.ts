import { vi } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";
import { ChangeType, ResourceType } from "@app/services/folder-commit/folder-commit-service";

import { pitServiceFactory } from "./pit-service";

const buildService = () => {
  const getChangeVersions = vi.fn().mockResolvedValue([]);
  const service = pitServiceFactory({
    folderCommitService: {
      getLatestCommit: vi.fn().mockResolvedValue({ id: "latest-commit" }),
      getCommitById: vi.fn().mockResolvedValue({ id: "target-commit" }),
      compareFolderStates: vi.fn().mockResolvedValue([
        {
          type: ResourceType.SECRET,
          id: "change-1",
          secretKey: "DB_PASSWORD",
          secretVersion: "2",
          secretId: "secret-1",
          isUpdate: true,
          changeType: ChangeType.UPDATE,
          fromVersion: "1"
        }
      ])
    },
    secretService: { getChangeVersions },
    folderService: {
      getFolderById: vi.fn().mockResolvedValue({
        id: "folder-1",
        name: "backend",
        path: "/app/backend"
      })
    },
    projectEnvDAL: {
      findOne: vi.fn().mockResolvedValue({ id: "env-1" })
    }
  } as unknown as Parameters<typeof pitServiceFactory>[0]);

  return { service, getChangeVersions };
};

describe("compareCommitChanges", () => {
  test("checks secret versions against the folder absolute path when the caller passes a relative path", async () => {
    const { service, getChangeVersions } = buildService();

    const diffs = await service.compareCommitChanges({
      actor: ActorType.USER,
      actorId: "user-1",
      actorOrgId: "org-1",
      actorAuthMethod: null,
      projectId: "project-1",
      commitId: "target-commit",
      folderId: "folder-1",
      environment: "prod",
      deepRollback: false,
      secretPath: "backend"
    });

    expect(getChangeVersions).toHaveBeenCalledWith(
      expect.objectContaining({
        secretId: "secret-1",
        secretVersion: "2",
        id: "change-1"
      }),
      "1",
      "user-1",
      ActorType.USER,
      "org-1",
      null,
      "env-1",
      "project-1",
      "/app/backend"
    );
    expect(diffs[0]?.folderPath).toBe("/app/backend");
  });
});
