import { describe, expect, it, vi } from "vitest";

import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  actorContext,
  actorOrg,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { FolderGrants } from "@app/domains/secrets-manager/secrets/ce/module";
import { TConcurrencySlot } from "@app/lib/concurrency/concurrency-limiter";

import { secretServiceFactory } from "./secret-service";

type TDeps = Parameters<typeof secretServiceFactory>[0];
type TSlotOptions = Parameters<TConcurrencySlot>[1];

const readsSecrets = Permission.fromRules({
  rules: [{ action: ProjectPermissionSecretActions.ReadValue, subject: ProjectPermissionSub.Secrets }] as never
});

const makeService = () => {
  const findByFolderIds = vi.fn().mockResolvedValue([
    { id: "A", folderId: "root-folder" },
    { id: "B", folderId: "root-folder" },
    { id: "C", folderId: "root-folder" }
  ]);
  const findImportedSecrets = vi.fn().mockResolvedValue([
    { id: "D", folderId: "shared-folder" },
    { id: "E", folderId: "shared-folder" }
  ]);

  const deps = {
    secretsPermissionService: {
      getSecretsPermission: vi.fn().mockResolvedValue({ permission: readsSecrets, folderGrants: FolderGrants.none() })
    },
    folderDAL: {
      findBySecretPath: vi.fn().mockResolvedValue({ id: "root-folder" }),
      findByManySecretPath: vi.fn().mockResolvedValue([{ id: "shared-folder", envId: "env", path: "/shared" }])
    },
    secretDAL: { findByFolderIds, find: findImportedSecrets },
    secretImportDAL: {
      findByFolderIds: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "import",
            folderId: "root-folder",
            importPath: "/shared",
            importEnv: { id: "env", slug: "dev", name: "Development" },
            isReplication: false
          }
        ])
        .mockResolvedValue([])
    }
  };

  return { service: secretServiceFactory(deps as unknown as TDeps), findByFolderIds };
};

const request = (overrides: { path?: string; recursive?: boolean; includeImports?: boolean } = {}) => ({
  projectId: "project",
  environment: "dev",
  path: "/app",
  ...overrides,
  actor: actorContext({ principal: userPrincipal({ id: "user-1" }), org: actorOrg({ id: "org" }) })
});

const recordingSlot = () => {
  const reported: number[] = [];
  const sizeKeys: (string | undefined)[] = [];
  const slot: TConcurrencySlot = (work, opts?: TSlotOptions) => {
    sizeKeys.push(opts?.sizeKey);
    return work((secretCount) => reported.push(secretCount));
  };
  return { slot, reported, sizeKeys };
};

describe("getSecrets", () => {
  it("returns the secrets when it is given no read slot", async () => {
    const { service } = makeService();

    const { secrets } = await service.getSecrets(request());

    expect(secrets.map((secret) => secret.id)).toEqual(["A", "B", "C"]);
  });

  it("reports the folder's secrets to the read slot", async () => {
    const { service } = makeService();
    const { slot, reported } = recordingSlot();

    await service.getSecrets({ ...request(), secretReadSlot: slot });

    expect(reported).toEqual([3]);
  });

  it("reports the imported secrets on top of the folder's", async () => {
    const { service } = makeService();
    const { slot, reported } = recordingSlot();

    const { imports } = await service.getSecrets({ ...request({ includeImports: true }), secretReadSlot: slot });

    expect(imports?.[0].secrets).toHaveLength(2);
    expect(reported).toEqual([3, 5, 5]);
  });

  it("stops before the imports load when the read slot refuses the folder's secrets", async () => {
    const { service, findByFolderIds } = makeService();
    const refusingSlot: TConcurrencySlot = (work) =>
      work(() => {
        throw new Error("refused");
      });

    await expect(
      service.getSecrets({ ...request({ includeImports: true }), secretReadSlot: refusingSlot })
    ).rejects.toThrow("refused");
    expect(findByFolderIds).toHaveBeenCalledTimes(1);
  });

  it("remembers a read's size per path and per shape of the read", async () => {
    const { service } = makeService();
    const { slot, sizeKeys } = recordingSlot();

    await service.getSecrets({ ...request(), secretReadSlot: slot });
    await service.getSecrets({ ...request(), secretReadSlot: slot });
    await service.getSecrets({ ...request({ path: "/other" }), secretReadSlot: slot });
    await service.getSecrets({ ...request({ includeImports: true }), secretReadSlot: slot });

    const [first, repeat, anotherPath, withImports] = sizeKeys;
    expect(first).toMatch(/^project:/);
    expect(repeat).toBe(first);
    expect(anotherPath).not.toBe(first);
    expect(withImports).not.toBe(first);
  });
});
