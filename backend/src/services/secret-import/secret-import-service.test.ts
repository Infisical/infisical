import { describe, expect, it, vi } from "vitest";

import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  actorContext,
  actorOrg,
  userPrincipal
} from "@app/domains/platform/organizations/ce/testing/actor-context-fixture";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";
import { FolderGrants } from "@app/domains/secrets-manager/secrets/ce/module";
import { compressZstd } from "@app/lib/compression";
import { TConcurrencySlot } from "@app/lib/concurrency/concurrency-limiter";
import { ForbiddenRequestError, ServerBusyError } from "@app/lib/errors";

import { secretImportServiceFactory } from "./secret-import-service";

type TDeps = Parameters<typeof secretImportServiceFactory>[0];
type TSlotOptions = Parameters<TConcurrencySlot>[1];

const ability = (rules: unknown[]) => Permission.fromRules({ rules: rules as never });

const readsImportedSecrets = ability([
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretImports },
  { action: ProjectPermissionSecretActions.ReadValue, subject: ProjectPermissionSub.Secrets }
]);

const permissionServiceFor = (permission: ReturnType<typeof ability>) => ({
  getSecretsPermission: vi.fn().mockResolvedValue({ permission, folderGrants: FolderGrants.none() }),
  getPermissionCacheFingerprint: vi.fn().mockResolvedValue("")
});

const identityCipher = {
  decryptor: vi.fn(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob),
  encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText })
};

const emptyKeyStore = () => ({
  pgGetIntItem: vi.fn().mockResolvedValue(0),
  hashGet: vi.fn().mockResolvedValue(null),
  hashSet: vi.fn().mockResolvedValue(1),
  setExpiry: vi.fn().mockResolvedValue(1),
  getItemBuffer: vi.fn().mockResolvedValue(undefined),
  setItemWithExpiry: vi.fn().mockResolvedValue("OK"),
  deleteItem: vi.fn().mockResolvedValue(1)
});

const makeService = ({ permission = readsImportedSecrets }: { permission?: ReturnType<typeof ability> } = {}) => {
  const decrypt = vi.fn(({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob);
  const findSecrets = vi.fn().mockResolvedValue(
    ["A", "B"].map((key) => ({
      id: key,
      key,
      version: 1,
      type: "shared",
      folderId: "shared-folder",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      encryptedValue: Buffer.from(`value-${key}`),
      encryptedComment: null,
      skipMultilineEncoding: false,
      tags: [],
      secretMetadata: []
    }))
  );

  const deps = {
    secretsPermissionService: permissionServiceFor(permission),
    folderDAL: {
      findBySecretPath: vi.fn().mockResolvedValue({ id: "root-folder" }),
      findByManySecretPath: vi.fn().mockResolvedValue([{ id: "shared-folder", envId: "env", path: "/shared" }])
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
    secretV2BridgeDAL: { find: findSecrets },
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project", version: 3 }) },
    projectBotService: { getBotKey: vi.fn().mockResolvedValue({ shouldUseSecretV2Bridge: true }) },
    kmsDataKeyService: {
      createCipherPairWithDataKey: vi
        .fn()
        .mockResolvedValue({ decryptor: decrypt, encryptor: identityCipher.encryptor })
    },
    orgDAL: { findOrgById: vi.fn().mockResolvedValue({ allowCrossProjectSecretSharing: false }) },
    keyStore: emptyKeyStore()
  };

  return { service: secretImportServiceFactory(deps as unknown as TDeps), decrypt, findSecrets };
};

const request = ({
  actorId = "user-1",
  projectId = "project",
  ...overrides
}: { path?: string; actorId?: string; projectId?: string } = {}) => ({
  projectId,
  environment: "dev",
  path: "/app",
  ...overrides,
  actor: actorContext({ principal: userPrincipal({ id: actorId }), org: actorOrg({ id: "org" }) })
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

describe("getRawSecretsFromImports", () => {
  it("returns the imported secrets when it is given no read slot", async () => {
    const { service } = makeService();

    const { secrets } = await service.getRawSecretsFromImports(request());

    expect(secrets.map((folder) => folder.secrets.map((secret) => secret.secretValue))).toEqual([
      ["value-A", "value-B"]
    ]);
  });

  it("loads the secrets inside the read slot and reports them", async () => {
    const { service } = makeService();
    const { slot, reported } = recordingSlot();

    const { secrets } = await service.getRawSecretsFromImports({ ...request(), secretReadSlot: slot });

    expect(secrets[0].secrets).toHaveLength(2);
    expect(reported).toEqual([2, 2]);
  });

  it("decrypts nothing when the read slot refuses the rows it loaded", async () => {
    const { service, decrypt, findSecrets } = makeService();
    const refusingSlot: TConcurrencySlot = (work) =>
      work(() => {
        throw new Error("refused");
      });

    await expect(service.getRawSecretsFromImports({ ...request(), secretReadSlot: refusingSlot })).rejects.toThrow(
      "refused"
    );
    expect(findSecrets).toHaveBeenCalledTimes(1);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("takes no read slot for a caller who cannot read the imports", async () => {
    const { service } = makeService({ permission: ability([]) });
    const { slot, sizeKeys } = recordingSlot();

    await expect(service.getRawSecretsFromImports({ ...request(), secretReadSlot: slot })).rejects.toThrow();
    expect(sizeKeys).toEqual([]);
  });

  it("remembers a read's size per project, environment and path, whoever the caller is", async () => {
    const { service } = makeService();
    const { slot, sizeKeys } = recordingSlot();

    await service.getRawSecretsFromImports({ ...request(), secretReadSlot: slot });
    await service.getRawSecretsFromImports({ ...request({ actorId: "user-2" }), secretReadSlot: slot });
    await service.getRawSecretsFromImports({ ...request({ path: "/other" }), secretReadSlot: slot });

    const [first, sameReadByAnotherCaller, anotherPath] = sizeKeys;
    expect(first).toMatch(/^project:/);
    expect(sameReadByAnotherCaller).toBe(first);
    expect(anotherPath).not.toBe(first);
  });

  it.each([1, 2, 3])("resolves no bot key for a caller it refuses (project version %i)", async (version) => {
    const getBotKey = vi.fn().mockResolvedValue({ botKey: "bot-key", shouldUseSecretV2Bridge: version === 3 });
    const service = secretImportServiceFactory({
      projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project", version }) },
      projectBotService: { getBotKey },
      secretsPermissionService: {
        getSecretsPermission: vi.fn().mockRejectedValue(new ForbiddenRequestError({ message: "no access" })),
        getPermissionCacheFingerprint: vi.fn().mockResolvedValue("")
      }
    } as unknown as TDeps);

    await expect(service.getRawSecretsFromImports(request())).rejects.toThrow("no access");
    expect(getBotKey).not.toHaveBeenCalled();
  });
});

const createRacingKeyStore = async () => {
  const payloads = new Map(
    await Promise.all(
      [5, 6].map(
        async (version) => [version, await compressZstd(Buffer.from(JSON.stringify({ secrets: [], version })))] as const
      )
    )
  );
  const state = { version: 5, writeCommitsDuringNextRead: false };
  const etags = new Map<string, string>();
  const keyStore = {
    ...emptyKeyStore(),
    pgGetIntItem: vi.fn(async () => state.version),
    hashGet: vi.fn(async (_key: string, field: string) => etags.get(field) ?? null),
    hashSet: vi.fn(async (_key: string, field: string, value: string) => {
      etags.set(field, value);
      return 1;
    }),
    getItemBuffer: vi.fn(async () => {
      const readVersion = state.version;
      if (state.writeCommitsDuringNextRead) {
        state.writeCommitsDuringNextRead = false;
        state.version += 1;
        etags.clear();
      }
      return payloads.get(readVersion);
    })
  };
  return { keyStore, state };
};

const buildCachedService = async () => {
  const { keyStore, state } = await createRacingKeyStore();
  const service = secretImportServiceFactory({
    keyStore,
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project", version: 3 }) },
    folderDAL: { findBySecretPath: vi.fn().mockResolvedValue(null) },
    secretsPermissionService: permissionServiceFor(readsImportedSecrets),
    kmsDataKeyService: { createCipherPairWithDataKey: vi.fn().mockResolvedValue(identityCipher) }
  } as unknown as TDeps);
  const slotTaken = vi.fn();
  const secretReadSlot: TConcurrencySlot = (work) => {
    slotTaken();
    return work(() => {});
  };
  const read = (ifNoneMatch?: string, slot: TConcurrencySlot = secretReadSlot) =>
    service.getRawSecretsFromImports({ ...request(), ifNoneMatch, secretReadSlot: slot });
  return { keyStore, state, read, slotTaken };
};

describe("getRawSecretsFromImports ETag", () => {
  it("never answers 304 with an ETag a read stored while a write committed", async () => {
    const { state, read } = await buildCachedService();

    const { etag: oldEtag } = await read();
    expect((await read(oldEtag)).notModified).toBe(true);

    state.writeCommitsDuringNextRead = true;
    expect((await read()).etag).toBe(oldEtag);

    const afterWrite = await read(oldEtag);
    expect(afterWrite.notModified).toBeUndefined();
    expect(afterWrite.etag).not.toBe(oldEtag);
  });
});

describe("getRawSecretsFromImports read slot", () => {
  it("takes a slot for a cache hit, and none to answer 304", async () => {
    const { read, slotTaken } = await buildCachedService();

    const { etag } = await read();
    expect(slotTaken).toHaveBeenCalledTimes(1);

    expect((await read(etag)).notModified).toBe(true);
    expect(slotTaken).toHaveBeenCalledTimes(1);
  });

  it("reports how many secrets a cache hit returns", async () => {
    const { keyStore, read } = await buildCachedService();
    const secret = { secretKey: "A", createdAt: new Date(0), updatedAt: new Date(0) };
    keyStore.getItemBuffer.mockResolvedValue(
      await compressZstd(
        Buffer.from(JSON.stringify({ secrets: [{ secrets: [secret, secret] }, { secrets: [secret] }] }))
      )
    );
    const { slot, reported } = recordingSlot();

    await read(undefined, slot);

    expect(reported).toEqual([3]);
  });

  it("passes on a refusal from the read slot on a cache hit instead of treating it as a cache miss", async () => {
    const { keyStore, read } = await buildCachedService();
    const secretReadSlot: TConcurrencySlot = (work) =>
      work(() => {
        throw new ServerBusyError({ message: "busy" });
      });

    await expect(read(undefined, secretReadSlot)).rejects.toBeInstanceOf(ServerBusyError);
    expect(keyStore.deleteItem).not.toHaveBeenCalled();
  });

  it("reports an empty read when the importing folder is gone, so a stale size is not kept", async () => {
    const { keyStore, read } = await buildCachedService();
    keyStore.getItemBuffer.mockResolvedValue(undefined);
    const reported: number[] = [];
    const secretReadSlot: TConcurrencySlot = (work) => work((secretCount) => reported.push(secretCount));

    await expect(read(undefined, secretReadSlot)).resolves.toMatchObject({ secrets: [] });

    expect(reported).toEqual([0]);
  });

  it("takes a slot for a read the cache cannot answer", async () => {
    const { keyStore, read, slotTaken } = await buildCachedService();
    keyStore.getItemBuffer.mockResolvedValue(undefined);

    await expect(read()).resolves.toEqual({ secrets: [] });

    expect(slotTaken).toHaveBeenCalledTimes(1);
  });
});
