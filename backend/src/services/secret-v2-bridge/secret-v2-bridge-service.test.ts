import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { compressZstd } from "@app/lib/compression";
import { ActorType } from "@app/services/auth/auth-type";

import { secretV2BridgeServiceFactory } from "./secret-v2-bridge-service";

describe("getSecrets ETag", () => {
  test("never answers 304 with an ETag a read stored while a write committed", async () => {
    const payloads = new Map(
      await Promise.all(
        [5, 6].map(
          async (version) =>
            [version, await compressZstd(Buffer.from(JSON.stringify({ secrets: [], imports: [], version })))] as const
        )
      )
    );
    const state = { version: 5, writeCommitsDuringNextRead: false };
    const etags = new Map<string, string>();
    const service = secretV2BridgeServiceFactory({
      keyStore: {
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
      },
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
    } as unknown as Parameters<typeof secretV2BridgeServiceFactory>[0]);
    const read = (ifNoneMatch?: string) =>
      service.getSecrets({
        projectId: "project-1",
        environment: "dev",
        path: "/",
        actor: ActorType.USER,
        actorId: "user-1",
        actorAuthMethod: null,
        actorOrgId: "org-1",
        viewSecretValue: true,
        ifNoneMatch
      } as Parameters<typeof service.getSecrets>[0]);

    const { etag: oldEtag } = await read();
    expect((await read(oldEtag)).notModified).toBe(true);

    state.writeCommitsDuringNextRead = true;
    expect((await read()).etag).toBe(oldEtag);

    const afterWrite = await read(oldEtag);
    expect(afterWrite.notModified).toBeUndefined();
    expect(afterWrite.etag).not.toBe(oldEtag);
  });
});
