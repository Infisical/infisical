import { describe, expect, test, vi } from "vitest";

import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { ActorType } from "@app/lib/auth/actor-types";

import { projectEnvServiceFactory } from "./project-env-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
}));

const PROJECT_ID = "project-id";
const ORG_ID = "org-id";
const TX = { isTransaction: true };

const createService = ({ environmentLimit, replicaEnvs, primaryEnvs }: Record<string, number>) => {
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
    secretsPermissionService: {
      getSecretsPermission: vi.fn().mockResolvedValue({ permission: { assert: vi.fn() } })
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
      actor: { principal: { type: ActorType.USER, id: "actor-id" }, org: { id: ORG_ID } } as never,
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
