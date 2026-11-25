import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { compressZstd } from "@app/lib/compression";
import { TConcurrencySlot } from "@app/lib/concurrency/concurrency-limiter";
import { ForbiddenRequestError, ServerBusyError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { secretImportServiceFactory } from "./secret-import-service";

const buildService = (projectVersion: number) => {
  const getBotKey = vi.fn().mockResolvedValue({ botKey: "bot-key", shouldUseSecretV2Bridge: projectVersion === 3 });
  const service = secretImportServiceFactory({
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-1", version: projectVersion }) },
    projectBotService: { getBotKey },
    permissionService: {
      getProjectPermission: vi.fn().mockRejectedValue(new ForbiddenRequestError({ message: "no access" })),
      getProjectPermissionCacheFingerprint: vi.fn().mockResolvedValue("")
    }
  } as unknown as Parameters<typeof secretImportServiceFactory>[0]);
  return { service, getBotKey };
};

describe("getRawSecretsFromImports", () => {
  test.each([1, 2, 3])("resolves no bot key for a caller it refuses (project version %i)", async (version) => {
    const { service, getBotKey } = buildService(version);

    await expect(
      service.getRawSecretsFromImports({
        projectId: "project-1",
        environment: "dev",
        path: "/",
        actor: ActorType.USER,
        actorId: "user-1",
        actorAuthMethod: null,
        actorOrgId: "other-org"
      })
    ).rejects.toThrow("no access");
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
    pgGetIntItem: vi.fn(async () => state.version),
    hashGet: vi.fn(async (_key: string, field: string) => etags.get(field) ?? null),
    hashSet: vi.fn(async (_key: string, field: string, value: string) => {
      etags.set(field, value);
      return 1;
    }),
    setExpiry: vi.fn().mockResolvedValue(1),
    deleteItem: vi.fn().mockResolvedValue(1),
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

describe("getRawSecretsFromImports ETag", () => {
  test("never answers 304 with an ETag a read stored while a write committed", async () => {
    const { keyStore, state } = await createRacingKeyStore();
    const service = secretImportServiceFactory({
      keyStore,
      projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-1", version: 3 }) },
      permissionService: {
        getProjectPermission: vi
          .fn()
          .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
        getProjectPermissionCacheFingerprint: vi.fn().mockResolvedValue("")
      },
      kmsDataKeyService: {
        createCipherPairWithDataKey: vi.fn().mockResolvedValue({
          decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob,
          encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText })
        })
      }
    } as unknown as Parameters<typeof secretImportServiceFactory>[0]);
    const read = (ifNoneMatch?: string) =>
      service.getRawSecretsFromImports({
        projectId: "project-1",
        environment: "dev",
        path: "/",
        actor: ActorType.USER,
        actorId: "user-1",
        actorAuthMethod: null,
        actorOrgId: "org-1",
        ifNoneMatch
      });

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
  const buildCachedService = async () => {
    const { keyStore } = await createRacingKeyStore();
    const service = secretImportServiceFactory({
      keyStore,
      projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-1", version: 3 }) },
      folderDAL: { findBySecretPath: vi.fn().mockResolvedValue(null) },
      permissionService: {
        getProjectPermission: vi
          .fn()
          .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
        getProjectPermissionCacheFingerprint: vi.fn().mockResolvedValue("")
      },
      kmsDataKeyService: {
        createCipherPairWithDataKey: vi.fn().mockResolvedValue({
          decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob,
          encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText })
        })
      }
    } as unknown as Parameters<typeof secretImportServiceFactory>[0]);
    const slotTaken = vi.fn();
    const secretReadSlot: TConcurrencySlot = (work) => {
      slotTaken();
      return work(() => {});
    };
    const read = (ifNoneMatch?: string, slot: TConcurrencySlot = secretReadSlot) =>
      service.getRawSecretsFromImports({
        projectId: "project-1",
        environment: "dev",
        path: "/",
        actor: ActorType.USER,
        actorId: "user-1",
        actorAuthMethod: null,
        actorOrgId: "org-1",
        ifNoneMatch,
        secretReadSlot: slot
      });
    return { keyStore, read, slotTaken };
  };

  test("takes a slot for a cache hit, and none to answer 304", async () => {
    const { read, slotTaken } = await buildCachedService();

    const { etag } = await read();
    expect(slotTaken).toHaveBeenCalledTimes(1);

    expect((await read(etag)).notModified).toBe(true);
    expect(slotTaken).toHaveBeenCalledTimes(1);
  });

  test("reports how many secrets a cache hit returns, keyed by the request", async () => {
    const { keyStore, read } = await buildCachedService();
    const secret = { secretKey: "A", createdAt: new Date(0), updatedAt: new Date(0) };
    keyStore.getItemBuffer.mockResolvedValue(
      await compressZstd(
        Buffer.from(JSON.stringify({ secrets: [{ secrets: [secret, secret] }, { secrets: [secret] }] }))
      )
    );
    const reported: number[] = [];
    const sizeKeys: (string | undefined)[] = [];
    const secretReadSlot: TConcurrencySlot = (work, opts) => {
      sizeKeys.push(opts?.sizeKey);
      return work((secretCount) => reported.push(secretCount));
    };

    await read(undefined, secretReadSlot);

    expect(reported).toEqual([3]);
    expect(sizeKeys[0]?.startsWith("project-1:")).toBe(true);
  });

  test("passes on a refusal from the read slot on a cache hit instead of treating it as a cache miss", async () => {
    const { keyStore, read } = await buildCachedService();
    const secretReadSlot: TConcurrencySlot = (work) =>
      work(() => {
        throw new ServerBusyError({ message: "busy" });
      });

    await expect(read(undefined, secretReadSlot)).rejects.toBeInstanceOf(ServerBusyError);
    expect(keyStore.deleteItem).not.toHaveBeenCalled();
  });

  test("reports an empty read when the importing folder is gone, so a stale size is not kept", async () => {
    const { keyStore, read } = await buildCachedService();
    keyStore.getItemBuffer.mockResolvedValue(undefined);
    const reported: number[] = [];
    const secretReadSlot: TConcurrencySlot = (work) => work((secretCount) => reported.push(secretCount));

    await expect(read(undefined, secretReadSlot)).resolves.toMatchObject({ secrets: [] });

    expect(reported).toEqual([0]);
  });

  test("takes a slot for a read the cache cannot answer", async () => {
    const { keyStore, read, slotTaken } = await buildCachedService();
    keyStore.getItemBuffer.mockResolvedValue(undefined);

    await expect(read()).resolves.toEqual({ secrets: [] });

    expect(slotTaken).toHaveBeenCalledTimes(1);
  });
});
