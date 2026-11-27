import { createMongoAbility, MongoAbility } from "@casl/ability";
import { describe, expect, it, vi } from "vitest";

import { SecretType } from "@app/db/schemas";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TConcurrencySlot } from "@app/lib/concurrency/concurrency-limiter";
import { ActorType } from "@app/services/auth/auth-type";

import { secretV2BridgeServiceFactory } from "./secret-v2-bridge-service";

vi.mock("@app/lib/telemetry/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/telemetry/metrics")>()),
  recordSecretReadMetric: vi.fn()
}));

type TDeps = Parameters<typeof secretV2BridgeServiceFactory>[0];
type TSlotOptions = Parameters<TConcurrencySlot>[1];

const readsSecrets = createMongoAbility<MongoAbility<ProjectPermissionSet>>([
  { action: ProjectPermissionSecretActions.DescribeSecret, subject: ProjectPermissionSub.Secrets },
  { action: ProjectPermissionSecretActions.ReadValue, subject: ProjectPermissionSub.Secrets }
] as never);

const secretRow = (key: string, folderId: string) => ({
  id: key,
  key,
  version: 1,
  type: "shared",
  folderId,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  encryptedValue: Buffer.from(`value-${key}`),
  encryptedComment: null,
  skipMultilineEncoding: false,
  tags: [],
  secretMetadata: []
});

const makeService = ({ secretInFolder = false }: { secretInFolder?: boolean } = {}) => {
  const decrypt = vi.fn(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob);
  const findImportedSecrets = vi.fn().mockResolvedValue(["A", "B"].map((key) => secretRow(key, "shared-folder")));

  const deps = {
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ permission: readsSecrets }) },
    folderDAL: {
      findBySecretPath: vi.fn().mockResolvedValue({ id: "root-folder" }),
      findByManySecretPath: vi.fn().mockResolvedValue([{ id: "shared-folder", envId: "env", path: "/shared" }])
    },
    secretDAL: {
      findOneWithTags: vi.fn().mockResolvedValue(secretInFolder ? secretRow("A", "root-folder") : undefined),
      find: findImportedSecrets
    },
    secretImportDAL: {
      find: vi.fn().mockResolvedValue([
        {
          id: "import",
          folderId: "root-folder",
          importPath: "/shared",
          importEnv: { id: "env", slug: "dev", name: "Development", projectId: "project" },
          position: 1,
          version: 1,
          isReplication: false,
          isReserved: false,
          createdAt: new Date(0),
          updatedAt: new Date(0)
        }
      ]),
      findByFolderIds: vi.fn().mockResolvedValue([]),
      findByIds: vi.fn().mockResolvedValue([])
    },
    kmsDataKeyService: { createCipherPairWithDataKey: vi.fn().mockResolvedValue({ decryptor: decrypt }) },
    orgDAL: { findOrgById: vi.fn().mockResolvedValue({ allowCrossProjectSecretSharing: false }) }
  };

  return { service: secretV2BridgeServiceFactory(deps as unknown as TDeps), decrypt, findImportedSecrets };
};

const request = (overrides: { secretName?: string; path?: string } = {}) => ({
  projectId: "project",
  environment: "dev",
  path: "/app",
  secretName: "A",
  type: SecretType.Shared,
  viewSecretValue: true,
  includeImports: true,
  actor: ActorType.USER as const,
  actorId: "user-1",
  actorOrgId: "org",
  actorAuthMethod: null,
  ...overrides
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

describe("getSecretByName", () => {
  it("takes no read slot for a secret that is in the folder", async () => {
    const { service, findImportedSecrets } = makeService({ secretInFolder: true });
    const { slot, sizeKeys } = recordingSlot();

    const secret = await service.getSecretByName({ ...request(), secretReadSlot: slot });

    expect(secret.secretValue).toBe("value-A");
    expect(sizeKeys).toEqual([]);
    expect(findImportedSecrets).not.toHaveBeenCalled();
  });

  it("returns a secret found in an import when it is given no read slot", async () => {
    const { service } = makeService();

    const secret = await service.getSecretByName(request());

    expect(secret.secretValue).toBe("value-A");
  });

  it("searches the imports inside the read slot and reports the secrets it loaded", async () => {
    const { service } = makeService();
    const { slot, reported } = recordingSlot();

    const secret = await service.getSecretByName({ ...request(), secretReadSlot: slot });

    expect(secret.secretValue).toBe("value-A");
    expect(reported).toEqual([2, 2]);
  });

  it("decrypts nothing when the read slot refuses the rows it loaded", async () => {
    const { service, decrypt, findImportedSecrets } = makeService();
    const refusingSlot: TConcurrencySlot = (work) =>
      work(() => {
        throw new Error("refused");
      });

    await expect(service.getSecretByName({ ...request(), secretReadSlot: refusingSlot })).rejects.toThrow("refused");
    expect(findImportedSecrets).toHaveBeenCalledTimes(1);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("reports the imported secrets it loaded for a name that is in none of them", async () => {
    const { service } = makeService();
    const { slot, reported } = recordingSlot();

    await expect(
      service.getSecretByName({ ...request({ secretName: "MISSING" }), secretReadSlot: slot })
    ).rejects.toThrow("Secret with name 'MISSING' not found");
    expect(reported).toEqual([2, 2]);
  });

  it("remembers the size of an import search per project, environment and path, whatever the secret name", async () => {
    const { service } = makeService();
    const { slot, sizeKeys } = recordingSlot();

    await service.getSecretByName({ ...request(), secretReadSlot: slot });
    await service.getSecretByName({ ...request({ secretName: "B" }), secretReadSlot: slot });
    await service.getSecretByName({ ...request({ path: "/other" }), secretReadSlot: slot });

    const [first, anotherName, anotherPath] = sizeKeys;
    expect(first).toMatch(/^project:/);
    expect(anotherName).toBe(first);
    expect(anotherPath).not.toBe(first);
  });
});
