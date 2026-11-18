import { vi } from "vitest";

import { honeyTokenCleanupServiceFactory } from "./honey-token-cleanup-service";
import { HoneyTokenManagedBy, HoneyTokenStatus } from "./honey-token-enums";
import { HONEY_TOKEN_RESOURCE_TYPE } from "./honey-token-events";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const revokeCredentials = vi.fn();
vi.mock("./honey-token-provider-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./honey-token-provider-fns")>()),
  getHoneyTokenServiceHooksByType: () => ({ aws: { revokeCredentials } })
}));

const token = (id: string) => ({
  id,
  type: "aws",
  orgId: "org-1",
  projectId: "proj-1",
  config: { managedBy: HoneyTokenManagedBy.Instance },
  encryptedCredentials: Buffer.from(JSON.stringify({ accessKeyId: id }))
});

const buildService = (tokens: ReturnType<typeof token>[]) => {
  const transactions: object[] = [];
  const updates: { ids: string[]; status: string; tx: unknown }[] = [];
  const reaps: { resourceType: string; resourceIds: string[]; tx: unknown }[] = [];

  const service = honeyTokenCleanupServiceFactory({
    honeyTokenDAL: {
      findUnrevokedByProjectIdForCleanup: async () => tokens,
      findUnrevokedByOrgTreeForCleanup: async () => tokens,
      transaction: async <T>(fn: (tx: object) => Promise<T>) => {
        const tx = { id: transactions.length };
        transactions.push(tx);
        return fn(tx);
      },
      update: async (filter: { $in: { id: string[] } }, data: { status: string }, tx: unknown) => {
        updates.push({ ids: filter.$in.id, status: data.status, tx });
        return [];
      }
    },
    honeyTokenConfigDAL: { findOne: async () => null },
    kmsDataKeyService: {
      createCipherPairWithDataKey: async () => ({
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      })
    },
    appConnectionDAL: { findById: async () => null },
    alertService: {
      deleteAlertsForDeletedResources: async (
        { resourceType, resourceIds }: { resourceType: string; resourceIds: string[] },
        tx: unknown
      ) => {
        reaps.push({ resourceType, resourceIds, tx });
        return resourceIds.length;
      }
    }
  } as never);

  return { service, updates, reaps };
};

describe("honey token cleanup on project deletion", () => {
  beforeEach(() => {
    revokeCredentials.mockReset();
    revokeCredentials.mockResolvedValue(undefined);
  });

  test("deletes the alerts of the tokens it revoked, in the transaction that marks them revoked", async () => {
    const { service, updates, reaps } = buildService([token("ht-1"), token("ht-2")]);

    await service.revokeProjectHoneyTokens("proj-1");

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ ids: ["ht-1", "ht-2"], status: HoneyTokenStatus.Revoked });
    expect(reaps).toEqual([
      { resourceType: HONEY_TOKEN_RESOURCE_TYPE, resourceIds: ["ht-1", "ht-2"], tx: updates[0].tx }
    ]);
  });

  test("keeps the alert of a token whose credentials could not be revoked", async () => {
    revokeCredentials.mockImplementation(async ({ credentials }: { credentials: { accessKeyId: string } }) => {
      if (credentials.accessKeyId === "ht-2") throw new Error("DeleteConflict");
    });
    const { service, updates, reaps } = buildService([token("ht-1"), token("ht-2")]);

    await service.revokeProjectHoneyTokens("proj-1");

    expect(updates[0].ids).toEqual(["ht-1"]);
    expect(reaps[0].resourceIds).toEqual(["ht-1"]);
  });

  test("touches nothing when no token could be revoked", async () => {
    revokeCredentials.mockRejectedValue(new Error("DeleteConflict"));
    const { service, updates, reaps } = buildService([token("ht-1")]);

    await service.revokeProjectHoneyTokens("proj-1");

    expect(updates).toHaveLength(0);
    expect(reaps).toHaveLength(0);
  });
});
