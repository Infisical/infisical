import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { compressZstd } from "@app/lib/compression";
import { ForbiddenRequestError } from "@app/lib/errors";
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
