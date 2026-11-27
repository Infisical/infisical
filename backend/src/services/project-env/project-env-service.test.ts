import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  actorContext,
  actorOrg,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { FolderGrants } from "@app/domains/secrets-manager/secrets/ce/module";

import { projectEnvServiceFactory } from "./project-env-service";

const tx = { executionPromise: Promise.resolve() } as unknown as Knex;

const buildService = () => {
  let inTransaction = false;
  const invalidatedInTransaction: boolean[] = [];
  const projectEnvDAL = {
    transaction: vi.fn(async <T>(callback: (trx: Knex) => Promise<T>) => {
      inTransaction = true;
      try {
        return await callback(tx);
      } finally {
        inTransaction = false;
      }
    }),
    delete: vi.fn().mockResolvedValue([{ id: "env-1", position: 2 }]),
    closePositionGap: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn().mockResolvedValue({ id: "env-1", position: 2 }),
    findLastEnvPosition: vi.fn().mockResolvedValue(3),
    softDeleteById: vi.fn().mockResolvedValue({ id: "env-1" })
  };
  const secretV2BridgeDAL = {
    findGrantTargetProjectIds: vi.fn().mockResolvedValue(["importing-project"]),
    invalidateSecretCacheByProjectId: vi.fn(async () => {
      invalidatedInTransaction.push(inTransaction);
    })
  };
  const service = projectEnvServiceFactory({
    projectEnvDAL,
    secretV2BridgeDAL,
    secretsPermissionService: {
      getSecretsPermission: vi.fn().mockResolvedValue({
        permission: Permission.fromRules({
          rules: [{ action: ProjectPermissionActions.Delete, subject: ProjectPermissionSub.Environments }] as never
        }),
        folderGrants: FolderGrants.none()
      }),
      within: vi.fn().mockReturnValue({ invalidateFolderGrants: vi.fn().mockResolvedValue(undefined) })
    },
    keyStore: {
      acquireLock: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) }),
      setItemWithExpiry: vi.fn().mockResolvedValue("OK")
    },
    approvalPolicySecretEnvironmentDAL: { findPolicyByEnvId: vi.fn().mockResolvedValue(undefined) }
  } as unknown as Parameters<typeof projectEnvServiceFactory>[0]);
  return { service, projectEnvDAL, secretV2BridgeDAL, invalidatedInTransaction };
};

const deleteDto = {
  projectId: "project-1",
  id: "env-1",
  actor: actorContext({ principal: userPrincipal({ id: "user-1" }), org: actorOrg({ id: "org-1" }) })
};

describe("deleteEnvironment", () => {
  test("reads the grant targets before a hard delete cascades them and invalidates them", async () => {
    const { service, projectEnvDAL, secretV2BridgeDAL, invalidatedInTransaction } = buildService();

    await service.deleteEnvironment({ ...deleteDto, hardDelete: true });

    expect(secretV2BridgeDAL.findGrantTargetProjectIds).toHaveBeenCalledWith("project-1", tx);
    expect(secretV2BridgeDAL.findGrantTargetProjectIds.mock.invocationCallOrder[0]).toBeLessThan(
      projectEnvDAL.delete.mock.invocationCallOrder[0]
    );
    expect(secretV2BridgeDAL.invalidateSecretCacheByProjectId).toHaveBeenCalledWith("project-1", tx, {
      grantTargetProjectIds: ["importing-project"]
    });
    expect(invalidatedInTransaction).toEqual([true]);
  });

  test("invalidates the secret cache when an environment is soft-deleted", async () => {
    const { service, secretV2BridgeDAL, invalidatedInTransaction } = buildService();

    await service.deleteEnvironment(deleteDto);

    expect(secretV2BridgeDAL.invalidateSecretCacheByProjectId).toHaveBeenCalledWith("project-1", tx);
    expect(invalidatedInTransaction).toEqual([true]);
  });
});
