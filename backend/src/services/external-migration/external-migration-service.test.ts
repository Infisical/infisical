import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import { SecretProtectionType } from "../secret/secret-types";
import { externalMigrationServiceFactory } from "./external-migration-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

vi.mock("../app-connection/hc-vault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app-connection/hc-vault")>();
  return {
    ...actual,
    getHCVaultSecretsForPaths: vi.fn((_namespace: string, _mountPath: string, vaultSecretPaths: string[]) =>
      Promise.resolve(
        vaultSecretPaths.map((vaultSecretPath) => ({
          vaultSecretPath,
          secrets: { [`KEY_${vaultSecretPath.split("/").filter(Boolean).pop()}`]: "value" }
        }))
      )
    )
  };
});

const PROJECT_ID = "project-1";
const ENVIRONMENT = "prod";
const BASE_PATH = "/base";

const actor = {
  type: ActorType.USER,
  id: "user-1",
  orgId: "org-1",
  authMethod: undefined
} as unknown as Parameters<ReturnType<typeof externalMigrationServiceFactory>["importVaultSecrets"]>[0]["actor"];

// only the collaborators the structure-preserving import touches; anything else is left undefined so an
// unexpected reach crashes instead of silently passing
const buildService = ({ approvalPaths = [] as string[] } = {}) => {
  const createManySecretsRaw = vi.fn(({ secretPath }: { secretPath: string }) => {
    if (approvalPaths.includes(secretPath)) {
      return Promise.resolve({
        type: SecretProtectionType.Approval as const,
        approval: {
          id: `sar-${secretPath}`,
          slug: "sar-slug",
          policyId: "policy-1",
          committerUserId: "user-1",
          commits: [{ id: "commit-1" }]
        }
      });
    }
    return Promise.resolve({ type: SecretProtectionType.Direct as const, secrets: [] });
  });

  const existingPaths = new Set([BASE_PATH]);

  const deps = {
    permissionService: {
      getProjectPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
    },
    appConnectionService: { validateAppConnectionUsageById: vi.fn().mockResolvedValue({ id: "connection-1" }) },
    projectEnvDAL: { findOne: vi.fn().mockResolvedValue({ id: "env-1", slug: ENVIRONMENT, name: "Production" }) },
    folderDAL: {
      transaction: vi.fn((cb: (tx: unknown) => unknown) => Promise.resolve(cb({}))),
      findByManySecretPath: vi.fn((query: { secretPath: string }[]) =>
        Promise.resolve(
          query.map(({ secretPath }) =>
            existingPaths.has(secretPath) ? { id: `folder-${secretPath}`, envId: "env-1" } : undefined
          )
        )
      )
    },
    folderService: {
      createManyFolders: vi.fn(({ folders }: { folders: { name: string; path: string }[] }) => {
        for (const folder of folders) {
          const folderPath = folder.path === "/" ? `/${folder.name}` : `${folder.path}/${folder.name}`;
          existingPaths.add(folderPath);
        }
        return Promise.resolve({
          folders: folders.map((folder) => ({ id: `folder-${folder.name}`, envId: "env-1" })),
          count: folders.length
        });
      })
    },
    secretService: { createManySecretsRaw },
    auditLogService: { createAuditLog: vi.fn().mockResolvedValue(undefined) },
    externalMigrationQueue: { enqueueVaultImportSideEffects: vi.fn().mockResolvedValue(undefined) },
    gatewayService: {},
    gatewayV2Service: {},
    gatewayDAL: {},
    gatewayV2DAL: {},
    gatewayPoolService: {},
    userDAL: {}
  };

  const service = externalMigrationServiceFactory(
    deps as unknown as Parameters<typeof externalMigrationServiceFactory>[0]
  );
  return { service, deps };
};

const importWithStructure = (
  service: ReturnType<typeof buildService>["service"],
  vaultSecretPaths: string[] = ["kv/app", "kv/app/db"]
) =>
  service.importVaultSecrets({
    actor,
    projectId: PROJECT_ID,
    environment: ENVIRONMENT,
    secretPath: BASE_PATH,
    vaultNamespace: "",
    mountPath: "kv",
    vaultSecretPaths,
    connectionId: "connection-1",
    keepVaultStructure: true,
    auditLogInfo: {} as never
  });

describe("importVaultSecrets preserving the Vault structure", () => {
  // a change policy scoped to one level (e.g. '/base/*') governs some of the folders the import creates and
  // not others, so one import both writes secrets and opens change requests
  test("reports the written and the approval-pending paths separately when only some folders are governed by a policy", async () => {
    const { service } = buildService({ approvalPaths: ["/base/app"] });

    const result = await importWithStructure(service);

    expect(result).toEqual({
      status: "approval-required",
      importedPaths: ["/base/app/db"],
      approvalRequiredPaths: ["/base/app"],
      importedSecretCount: 1,
      approvalRequiredSecretCount: 1
    });
  });

  test("reports every path as imported when no folder is governed by a policy", async () => {
    const { service } = buildService();

    const result = await importWithStructure(service);

    expect(result).toEqual({
      status: "imported",
      importedPaths: ["/base/app", "/base/app/db"],
      approvalRequiredPaths: [],
      importedSecretCount: 2,
      approvalRequiredSecretCount: 0
    });
  });

  test("reports every path as approval-pending when every folder is governed by a policy", async () => {
    const { service } = buildService({ approvalPaths: ["/base/app", "/base/app/db"] });

    const result = await importWithStructure(service);

    expect(result).toEqual({
      status: "approval-required",
      importedPaths: [],
      approvalRequiredPaths: ["/base/app", "/base/app/db"],
      importedSecretCount: 0,
      approvalRequiredSecretCount: 2
    });
  });

  // every write in the import passes skipPostProcessing, so this enqueue is the only thing that syncs the
  // written secrets and tells reviewers a change request is waiting
  test("enqueues one side-effects job with both halves of a mixed import", async () => {
    const { service, deps } = buildService({ approvalPaths: ["/base/app"] });

    await importWithStructure(service);

    expect(deps.externalMigrationQueue.enqueueVaultImportSideEffects).toHaveBeenCalledTimes(1);
    expect(deps.externalMigrationQueue.enqueueVaultImportSideEffects).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      environment: ENVIRONMENT,
      environmentName: "Production",
      actor: ActorType.USER,
      actorId: "user-1",
      actorOrgId: "org-1",
      auditLogInfo: {},
      writtenFolders: [{ folderPath: "/base/app/db", secretKeys: ["KEY_db"] }],
      approvedFolders: [
        {
          folderPath: "/base/app",
          secretKeys: ["KEY_app"],
          approval: {
            id: "sar-/base/app",
            policyId: "policy-1",
            slug: "sar-slug",
            committerUserId: "user-1",
            commits: [{ id: "commit-1" }]
          }
        }
      ]
    });

    expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
  });

  test("passes the folder resolved during the import into each secret write", async () => {
    const { service, deps } = buildService();

    await importWithStructure(service);

    expect(deps.secretService.createManySecretsRaw).toHaveBeenCalledTimes(2);
    expect(deps.secretService.createManySecretsRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        secretPath: "/base/app",
        folder: { id: "folder-/base/app", envId: "env-1", environment: { slug: ENVIRONMENT, name: "Production" } }
      })
    );
    expect(deps.secretService.createManySecretsRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        secretPath: "/base/app/db",
        folder: { id: "folder-/base/app/db", envId: "env-1", environment: { slug: ENVIRONMENT, name: "Production" } }
      })
    );
  });

  // the import has already committed by the time these run, so a failed enqueue must not turn a
  // successful import into a failed request
  test("still reports the import when the side-effects job cannot be queued", async () => {
    const { service, deps } = buildService({ approvalPaths: ["/base/app"] });
    deps.externalMigrationQueue.enqueueVaultImportSideEffects.mockRejectedValue(new Error("redis down"));

    const result = await importWithStructure(service);

    expect(result).toEqual({
      status: "approval-required",
      importedPaths: ["/base/app/db"],
      approvalRequiredPaths: ["/base/app"],
      importedSecretCount: 1,
      approvalRequiredSecretCount: 1
    });
  });
});
