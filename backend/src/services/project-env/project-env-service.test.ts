import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";

import { ActorType } from "../auth/auth-type";
import { projectEnvServiceFactory } from "./project-env-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
}));

const PROJECT_ID = "project-id";
const ORG_ID = "org-id";
const TX = { isTransaction: true };

const createService = ({ environmentLimit, replicaEnvs, primaryEnvs }: Record<string, number>) => {
  const builder = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  builder.can(ProjectPermissionActions.Create, ProjectPermissionSub.Environments);
  const permission = builder.build({ conditionsMatcher });

  const envsOf = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `env-${i}` }));
  const projectEnvDAL = {
    find: vi.fn((_filter: unknown, opts?: { tx?: unknown }) =>
      Promise.resolve(envsOf(opts?.tx ? primaryEnvs : replicaEnvs))
    ),
    findBySlugIncludingExpired: vi.fn().mockResolvedValue(undefined),
    findLastEnvPosition: vi.fn().mockResolvedValue(primaryEnvs),
    create: vi.fn((data: object) => Promise.resolve({ id: "new-env", ...data })),
    transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(TX))
  };

  const service = projectEnvServiceFactory({
    projectEnvDAL: projectEnvDAL as never,
    folderDAL: { create: vi.fn().mockResolvedValue({}) } as never,
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({ permission }),
      invalidateProjectFolderPermissionCache: vi.fn()
    } as never,
    licenseService: new FakeLicenseService().setPlan(ORG_ID, { environmentLimit }),
    keyStore: {
      acquireLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
      setItemWithExpiry: vi.fn(),
      getItem: vi.fn(),
      waitTillReady: vi.fn(),
      deleteItem: vi.fn()
    } as never,
    approvalPolicySecretEnvironmentDAL: { findPolicyByEnvId: vi.fn() } as never
  });

  const createEnvironment = () =>
    service.createEnvironment({
      projectId: PROJECT_ID,
      actor: ActorType.USER,
      actorId: "actor-id",
      actorOrgId: ORG_ID,
      actorAuthMethod: null,
      name: "Staging",
      slug: "staging"
    });

  return { createEnvironment, projectEnvDAL };
};

describe("createEnvironment plan limit", () => {
  test("counts environments on the primary, so a lagging replica cannot let one past the limit", async () => {
    const { createEnvironment, projectEnvDAL } = createService({ environmentLimit: 3, replicaEnvs: 2, primaryEnvs: 3 });

    await expect(createEnvironment()).rejects.toThrow(/environment limit reached/);
    expect(projectEnvDAL.find).toHaveBeenCalledWith({ projectId: PROJECT_ID }, { tx: TX });
    expect(projectEnvDAL.create).not.toHaveBeenCalled();
  });

  test("creates the environment while the project is under the limit", async () => {
    const { createEnvironment, projectEnvDAL } = createService({ environmentLimit: 3, replicaEnvs: 2, primaryEnvs: 2 });

    await expect(createEnvironment()).resolves.toMatchObject({ slug: "staging", position: 3 });
    expect(projectEnvDAL.create).toHaveBeenCalledOnce();
  });
});
