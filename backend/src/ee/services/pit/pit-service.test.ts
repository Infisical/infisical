import { vi } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";
import { ChangeType, ResourceType } from "@app/services/folder-commit/folder-commit-service";

import { pitServiceFactory } from "./pit-service";

const buildService = ({ commitFolderId = "folder-1" }: { commitFolderId?: string } = {}) => {
  const getChangeVersions = vi.fn().mockResolvedValue([]);
  const compareFolderStates = vi.fn().mockResolvedValue([
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
  ]);
  const findEnv = vi.fn().mockResolvedValue({ id: "env-prod", slug: "prod" });
  const service = pitServiceFactory({
    folderCommitService: {
      getLatestCommit: vi.fn().mockResolvedValue({ id: "latest-commit" }),
      getCommitById: vi.fn().mockResolvedValue({ id: "target-commit", folderId: commitFolderId, envId: "env-prod" }),
      compareFolderStates
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
      findOne: findEnv
    }
  } as unknown as Parameters<typeof pitServiceFactory>[0]);

  return { service, getChangeVersions, compareFolderStates, findEnv };
};

describe("compareCommitChanges", () => {
  test("checks secret versions against the absolute path of the commit's folder", async () => {
    const { service, getChangeVersions } = buildService();

    const { diffs } = await service.compareCommitChanges({
      actor: ActorType.USER,
      actorId: "user-1",
      actorOrgId: "org-1",
      actorAuthMethod: null,
      projectId: "project-1",
      commitId: "target-commit",
      folderId: "folder-1",
      deepRollback: false
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
      "env-prod",
      "project-1",
      "/app/backend"
    );
    expect(diffs[0]?.folderPath).toBe("/app/backend");
  });

  test("resolves the environment and folder path from the commit", async () => {
    const { service, findEnv } = buildService();

    const { environment, folderPath } = await service.compareCommitChanges({
      actor: ActorType.USER,
      actorId: "user-1",
      actorOrgId: "org-1",
      actorAuthMethod: null,
      projectId: "project-1",
      commitId: "target-commit",
      folderId: "folder-1",
      deepRollback: false
    });

    expect(findEnv).toHaveBeenCalledWith({ projectId: "project-1", id: "env-prod" });
    expect(environment).toBe("prod");
    expect(folderPath).toBe("/app/backend");
  });

  test("rejects a commit that belongs to a different folder", async () => {
    const { service, getChangeVersions, compareFolderStates } = buildService({ commitFolderId: "restricted-folder" });

    await expect(
      service.compareCommitChanges({
        actor: ActorType.USER,
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null,
        projectId: "project-1",
        commitId: "target-commit",
        folderId: "folder-1",
        deepRollback: false
      })
    ).rejects.toThrow("does not belong to folder");

    expect(compareFolderStates).not.toHaveBeenCalled();
    expect(getChangeVersions).not.toHaveBeenCalled();
  });
});
