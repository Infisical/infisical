import { createMongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import { projectEnvServiceFactory } from "./project-env-service";

const tx = {} as Knex;

const buildService = () => {
  const projectEnvDAL = {
    transaction: vi.fn(<T>(callback: (trx: Knex) => Promise<T>) => callback(tx)),
    delete: vi.fn().mockResolvedValue([{ id: "env-1", position: 2 }]),
    closePositionGap: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn().mockResolvedValue({ id: "env-1", position: 2 }),
    findLastEnvPosition: vi.fn().mockResolvedValue(3),
    softDeleteById: vi.fn().mockResolvedValue({ id: "env-1" })
  };
  const secretV2BridgeDAL = {
    findGrantTargetProjectIds: vi.fn().mockResolvedValue(["importing-project"]),
    invalidateSecretCacheByProjectId: vi.fn().mockResolvedValue(undefined)
  };
  const service = projectEnvServiceFactory({
    projectEnvDAL,
    secretV2BridgeDAL,
    permissionService: {
      getProjectPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
      invalidateProjectFolderPermissionCache: vi.fn().mockResolvedValue(undefined)
    },
    keyStore: {
      acquireLock: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) }),
      setItemWithExpiry: vi.fn().mockResolvedValue("OK")
    },
    approvalPolicySecretEnvironmentDAL: { findPolicyByEnvId: vi.fn().mockResolvedValue(undefined) }
  } as unknown as Parameters<typeof projectEnvServiceFactory>[0]);
  return { service, projectEnvDAL, secretV2BridgeDAL };
};

const deleteDto = {
  projectId: "project-1",
  id: "env-1",
  actor: ActorType.USER,
  actorId: "user-1",
  actorAuthMethod: null,
  actorOrgId: "org-1"
};

describe("deleteEnvironment", () => {
  test("reads the grant targets before a hard delete cascades them and invalidates them", async () => {
    const { service, projectEnvDAL, secretV2BridgeDAL } = buildService();

    await service.deleteEnvironment({ ...deleteDto, hardDelete: true });

    expect(secretV2BridgeDAL.findGrantTargetProjectIds).toHaveBeenCalledWith("project-1", tx);
    expect(secretV2BridgeDAL.findGrantTargetProjectIds.mock.invocationCallOrder[0]).toBeLessThan(
      projectEnvDAL.delete.mock.invocationCallOrder[0]
    );
    expect(secretV2BridgeDAL.invalidateSecretCacheByProjectId).toHaveBeenCalledWith("project-1", tx, {
      grantTargetProjectIds: ["importing-project"]
    });
  });

  test("invalidates the secret cache when an environment is soft-deleted", async () => {
    const { service, secretV2BridgeDAL } = buildService();

    await service.deleteEnvironment(deleteDto);

    expect(secretV2BridgeDAL.invalidateSecretCacheByProjectId).toHaveBeenCalledWith("project-1", tx);
  });
});
