import { afterEach, describe, expect, test, vi } from "vitest";

import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { ActorType } from "@app/lib/auth/actor-types";

import { projectEnvServiceFactory } from "./project-env-service";

const config = vi.hoisted(() => ({ INFISICAL_CLOUD: false }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

vi.mock("@app/domains/lib/transactions", () => ({
  sealKnexTransaction: (tx: unknown) => tx
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
}));

const PROJECT_ID = "project-id";
const ORG_ID = "org-id";
const DELETED_ENV_ID = "deleted-env";
const TX = { isTransaction: true };
const actor = { principal: { type: ActorType.USER, id: "actor-id" }, org: { id: ORG_ID } } as never;

type TRestoreCounts = {
  webhooksInEnv?: number;
  projectWebhooks?: number;
  rotationsInEnv?: number;
  projectRotations?: number;
  importPastLimit?: { folderId: string; total: number };
};

const createService = ({
  environmentLimit = null,
  replicaEnvs = 3,
  primaryEnvs = 3,
  plan = {},
  restore = {}
}: {
  environmentLimit?: number | null;
  replicaEnvs?: number;
  primaryEnvs?: number;
  plan?: Record<string, number>;
  restore?: TRestoreCounts;
} = {}) => {
  const envsOf = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `env-${i}` }));
  const projectEnvDAL = {
    find: vi.fn((_filter: unknown, opts?: { tx?: unknown }) =>
      Promise.resolve(envsOf(opts?.tx ? primaryEnvs : replicaEnvs))
    ),
    findOne: vi.fn().mockResolvedValue(undefined),
    findBySlugIncludingExpired: vi.fn().mockResolvedValue(undefined),
    findByIdIncludingExpired: vi.fn().mockResolvedValue({
      id: DELETED_ENV_ID,
      projectId: PROJECT_ID,
      slug: "legacy",
      deleteAfter: new Date(Date.now() + 86_400_000)
    }),
    findLastEnvPosition: vi.fn().mockResolvedValue(primaryEnvs),
    create: vi.fn((data: object) => Promise.resolve({ id: "new-env", ...data })),
    restoreById: vi.fn().mockResolvedValue({ id: DELETED_ENV_ID }),
    transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(TX))
  };
  const webhookDAL = {
    countByEnvId: vi.fn().mockResolvedValue(restore.webhooksInEnv ?? 0),
    countByProjectId: vi.fn().mockResolvedValue(restore.projectWebhooks ?? 0)
  };
  const secretRotationV2DAL = {
    countByEnvId: vi.fn().mockResolvedValue(restore.rotationsInEnv ?? 0),
    countByProject: vi.fn().mockResolvedValue(restore.projectRotations ?? 0)
  };
  const secretImportDAL = {
    findFolderPastLimitOnSourceRestore: vi.fn().mockResolvedValue(restore.importPastLimit)
  };

  const service = projectEnvServiceFactory({
    projectEnvDAL: projectEnvDAL as never,
    webhookDAL,
    secretRotationV2DAL,
    secretImportDAL,
    folderDAL: { create: vi.fn().mockResolvedValue({}) } as never,
    secretsPermissionService: {
      getSecretsPermission: vi.fn().mockResolvedValue({ permission: { assert: vi.fn() } }),
      within: () => ({ invalidateFolderGrants: vi.fn() })
    } as never,
    licenseService: new FakeLicenseService().setPlan(ORG_ID, { environmentLimit, ...plan }),
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
    service.createEnvironment({ projectId: PROJECT_ID, actor, name: "Staging", slug: "staging" });
  const restoreEnvironment = () => service.restoreEnvironment({ projectId: PROJECT_ID, actor, id: DELETED_ENV_ID });

  return { createEnvironment, restoreEnvironment, projectEnvDAL, webhookDAL, secretImportDAL };
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

describe("restoreEnvironment resource limits on Infisical Cloud", () => {
  afterEach(() => {
    config.INFISICAL_CLOUD = false;
  });

  test("refuses a restore that would bring the project's webhooks past the limit", async () => {
    // Setup
    config.INFISICAL_CLOUD = true;
    const { restoreEnvironment, projectEnvDAL, webhookDAL } = createService({
      plan: { smWebhooksPerProjectLimit: 3 },
      restore: { webhooksInEnv: 2, projectWebhooks: 2 }
    });

    // Action
    const result = restoreEnvironment();

    // Assert
    await expect(result).rejects.toThrow(
      "Restoring environment 'legacy' would bring its 2 webhooks back and the project past the maximum of 3 webhooks."
    );
    expect(webhookDAL.countByEnvId).toHaveBeenCalledWith(DELETED_ENV_ID, TX);
    expect(projectEnvDAL.restoreById).not.toHaveBeenCalled();
  });

  test("refuses a restore that would bring a folder importing from it past the import limit", async () => {
    // Setup
    config.INFISICAL_CLOUD = true;
    const { restoreEnvironment, projectEnvDAL, secretImportDAL } = createService({
      plan: { smSecretImportsPerFolderLimit: 3 },
      restore: { importPastLimit: { folderId: "folder-1", total: 4 } }
    });

    // Action
    const result = restoreEnvironment();

    // Assert
    await expect(result).rejects.toThrow("take a folder to 4 secret imports, past the maximum of 3");
    expect(secretImportDAL.findFolderPastLimitOnSourceRestore).toHaveBeenCalledExactlyOnceWith(DELETED_ENV_ID, 3, TX);
    expect(projectEnvDAL.restoreById).not.toHaveBeenCalled();
  });

  test("restores when everything it brings back fits", async () => {
    // Setup
    config.INFISICAL_CLOUD = true;
    const { restoreEnvironment, projectEnvDAL } = createService({
      plan: { smWebhooksPerProjectLimit: 3, smSecretRotationsPerProjectLimit: 3, smSecretImportsPerFolderLimit: 3 },
      restore: {
        webhooksInEnv: 1,
        projectWebhooks: 2,
        rotationsInEnv: 1,
        projectRotations: 2
      }
    });

    // Action
    await restoreEnvironment();

    // Assert
    expect(projectEnvDAL.restoreById).toHaveBeenCalledOnce();
  });

  test("counts nothing on a self-hosted instance", async () => {
    // Setup
    const { restoreEnvironment, projectEnvDAL, webhookDAL } = createService({
      plan: { smWebhooksPerProjectLimit: 3 },
      restore: { webhooksInEnv: 50, projectWebhooks: 50 }
    });

    // Action
    await restoreEnvironment();

    // Assert
    expect(webhookDAL.countByEnvId).not.toHaveBeenCalled();
    expect(projectEnvDAL.restoreById).toHaveBeenCalledOnce();
  });
});
