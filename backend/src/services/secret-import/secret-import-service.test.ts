import { describe, expect, test, vi } from "vitest";

import { Permission } from "@app/domains/platform/access-control/ce/module";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { FolderGrants } from "@app/domains/secrets-manager/secrets/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { secretImportServiceFactory } from "./secret-import-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INFISICAL_CLOUD: false })
}));

const PROJECT_ID = "project-1";
const ORG_ID = "org-1";
const TX = { name: "import-transaction" };
const actor = { principal: { type: ActorType.USER, id: "user-1" }, org: { id: ORG_ID } };
const destination = { id: "folder-app", path: "/app", environment: { id: "env-dev", slug: "dev", name: "Dev" } };

type TStoredImport = {
  id: string;
  importEnv: string;
  importPath: string;
  isReserved?: boolean;
  isReplication?: boolean;
};

const createService = (stored: TStoredImport[]) => {
  const secretImportDAL = {
    findIncludingExpired: vi.fn(async () => stored),
    findOne: vi.fn(async ({ id }: { id?: string }) => stored.find((imp) => imp.id === id)),
    transaction: vi.fn(<T>(cb: (tx: unknown) => Promise<T>) => cb(TX)),
    countByFolderId: vi.fn(async () => stored.length),
    findLastImportPosition: vi.fn(async () => stored.length),
    create: vi.fn(async (row: object) => ({ id: "new-import", ...row })),
    update: vi.fn(async (_filter: object, row: object) => [{ id: "import-2", ...row }]),
    updateAllPosition: vi.fn()
  };
  const folderDAL = {
    findBySecretPath: vi.fn(async (_projectId: string, env: string, secretPath: string) =>
      env === "dev" && secretPath === "/app" ? destination : undefined
    ),
    lockFoldersForUpdate: vi.fn(),
    findSecretPathByFolderIds: vi.fn(async () => [{ path: "/app" }])
  };
  const envOf = (slug: string) => ({ id: `env-${slug}`, slug, name: slug, projectId: PROJECT_ID });
  const service = secretImportServiceFactory({
    secretImportDAL,
    folderDAL,
    secretsPermissionService: {
      getSecretsPermission: vi.fn(async () => ({
        permission: Permission.fromRules({ rules: [{ action: "manage", subject: "all" }] }),
        folderGrants: FolderGrants.none()
      }))
    },
    projectDAL: { checkProjectUpgradeStatus: vi.fn() },
    projectEnvDAL: {
      findBySlugs: vi.fn(async (_projectId: string, slugs: string[]) => slugs.map(envOf)),
      findById: vi.fn(async (id: string) => envOf(id.replace("env-", "")))
    },
    secretChangePolicyService: { getSecretApprovalPolicy: vi.fn(async () => null) },
    eventEmitter: { emit: vi.fn() },
    secretQueueService: { syncSecrets: vi.fn(), replicateSecrets: vi.fn() },
    secretV2BridgeDAL: { invalidateSecretCacheByProjectId: vi.fn() },
    licenseService: new FakeLicenseService()
  } as never);
  return { service, secretImportDAL, folderDAL };
};

const create = (service: ReturnType<typeof createService>["service"], environment: string, sourcePath: string) =>
  service.createImport({
    actor: actor as never,
    projectId: PROJECT_ID,
    environment: "dev",
    path: "/app",
    data: { environment, path: sourcePath }
  });

describe("one import per source in a folder", () => {
  test("refuses a second import of the same environment and path with 409", async () => {
    // Setup
    const { service, secretImportDAL, folderDAL } = createService([
      { id: "import-1", importEnv: "env-staging", importPath: "/shared" }
    ]);

    // Action
    const result = create(service, "staging", "/shared");

    // Assert
    await expect(result).rejects.toMatchObject({
      name: "Conflict",
      message:
        "Folder '/app' already imports secrets from '/shared' in environment 'staging'. Use the existing import instead of adding another."
    });
    expect(folderDAL.lockFoldersForUpdate).toHaveBeenCalledWith([destination.id], TX);
    expect(secretImportDAL.create).not.toHaveBeenCalled();
  });

  test("matches a stored path that was saved before paths were canonicalized", async () => {
    // Setup
    const { service, secretImportDAL } = createService([
      { id: "import-1", importEnv: "env-staging", importPath: "/shared/" }
    ]);

    // Action
    const result = create(service, "staging", "/shared");

    // Assert
    await expect(result).rejects.toMatchObject({ name: "Conflict" });
    expect(secretImportDAL.create).not.toHaveBeenCalled();
  });

  test("accepts the same path from another environment, and ignores reserved replication rows", async () => {
    // Setup
    const { service, secretImportDAL } = createService([
      { id: "import-1", importEnv: "env-staging", importPath: "/shared" },
      { id: "reserved-1", importEnv: "env-prod", importPath: "/shared", isReserved: true }
    ]);

    // Action
    await create(service, "prod", "/shared");

    // Assert
    expect(secretImportDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({ importEnv: "env-prod", importPath: "/shared" }),
      TX
    );
  });

  test("refuses repointing an import onto a source the folder already imports", async () => {
    // Setup
    const { service, secretImportDAL } = createService([
      { id: "import-1", importEnv: "env-staging", importPath: "/shared" },
      { id: "import-2", importEnv: "env-staging", importPath: "/other" }
    ]);

    // Action
    const result = service.updateImport({
      actor: actor as never,
      projectId: PROJECT_ID,
      environment: "dev",
      path: "/app",
      id: "import-2",
      data: { path: "/shared" }
    });

    // Assert
    await expect(result).rejects.toMatchObject({ name: "Conflict" });
    expect(secretImportDAL.update).not.toHaveBeenCalled();
  });

  test("keeps an older duplicate editable when its source does not change", async () => {
    // Setup
    const { service, secretImportDAL } = createService([
      { id: "import-1", importEnv: "env-staging", importPath: "/shared" },
      { id: "import-2", importEnv: "env-staging", importPath: "/shared" }
    ]);

    // Action
    await service.updateImport({
      actor: actor as never,
      projectId: PROJECT_ID,
      environment: "dev",
      path: "/app",
      id: "import-2",
      data: { path: "/shared", position: 1 }
    });

    // Assert
    expect(secretImportDAL.update).toHaveBeenCalled();
  });
});
