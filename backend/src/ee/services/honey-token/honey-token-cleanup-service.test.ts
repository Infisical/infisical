import { honeyTokenCleanupServiceFactory } from "./honey-token-cleanup-service";
import { HoneyTokenStatus, HoneyTokenType } from "./honey-token-enums";

const revokeCredentials = vi.fn();

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: async (connection: unknown) => connection
}));
vi.mock("./honey-token-provider-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./honey-token-provider-fns")>()),
  getHoneyTokenServiceHooksByType: () => ({ [HoneyTokenType.AWS]: { revokeCredentials } })
}));

const row = (id: string, overrides: Partial<{ status: string; orgId: string; type: string }> = {}) => ({
  id,
  type: HoneyTokenType.AWS as string,
  status: HoneyTokenStatus.Active as string,
  projectId: "project-1",
  orgId: "org-1",
  encryptedCredentials: Buffer.from(JSON.stringify({ accessKeyId: `AKIA-${id}`, iamUserName: `inf_ht_${id}` })),
  ...overrides
});

const buildService = ({ rows, hasConfig = true }: { rows: ReturnType<typeof row>[]; hasConfig?: boolean }) => {
  const honeyTokenDAL = {
    findUnrevokedByProjectIdForCleanup: vi.fn().mockResolvedValue(rows),
    findFolderlessForCleanup: vi.fn().mockResolvedValue(rows),
    delete: vi.fn().mockResolvedValue([])
  };
  const honeyTokenConfigDAL = {
    findOne: vi.fn().mockResolvedValue(hasConfig ? { connectionId: "connection-1" } : undefined)
  };
  const appConnectionDAL = { findById: vi.fn().mockResolvedValue({ id: "connection-1" }) };
  const kmsService = {
    createCipherPairWithDataKey: vi.fn().mockResolvedValue({
      decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
    })
  };

  const service = honeyTokenCleanupServiceFactory({
    honeyTokenDAL,
    honeyTokenConfigDAL,
    appConnectionDAL,
    kmsService
  } as unknown as Parameters<typeof honeyTokenCleanupServiceFactory>[0]);

  return { service, honeyTokenDAL, honeyTokenConfigDAL, appConnectionDAL };
};

describe("honeyTokenCleanupService", () => {
  beforeEach(() => {
    revokeCredentials.mockReset();
    revokeCredentials.mockResolvedValue(undefined);
  });

  test("folderless cleanup revokes credentials and deletes the rows", async () => {
    const { service, honeyTokenDAL } = buildService({ rows: [row("a"), row("b")] });

    await service.cleanupFolderlessHoneyTokens();

    expect(revokeCredentials).toHaveBeenCalledTimes(2);
    expect(revokeCredentials).toHaveBeenCalledWith({
      appConnection: { id: "connection-1" },
      credentials: { accessKeyId: "AKIA-a", iamUserName: "inf_ht_a" }
    });
    expect(honeyTokenDAL.delete).toHaveBeenCalledWith({ $in: { id: ["a", "b"] } });
  });

  test("folderless cleanup keeps a row whose revocation failed so the next run retries it", async () => {
    revokeCredentials.mockImplementation(async ({ credentials }: { credentials: { accessKeyId: string } }) => {
      if (credentials.accessKeyId === "AKIA-b") throw new Error("AWS unavailable");
    });
    const { service, honeyTokenDAL } = buildService({ rows: [row("a"), row("b")] });

    await service.cleanupFolderlessHoneyTokens();

    expect(honeyTokenDAL.delete).toHaveBeenCalledWith({ $in: { id: ["a"] } });
  });

  test("folderless cleanup deletes already-revoked rows without calling the provider", async () => {
    const { service, honeyTokenDAL } = buildService({ rows: [row("a", { status: HoneyTokenStatus.Revoked })] });

    await service.cleanupFolderlessHoneyTokens();

    expect(revokeCredentials).not.toHaveBeenCalled();
    expect(honeyTokenDAL.delete).toHaveBeenCalledWith({ $in: { id: ["a"] } });
  });

  test("folderless cleanup deletes rows whose org has no configuration left to revoke with", async () => {
    const { service, honeyTokenDAL } = buildService({ rows: [row("a")], hasConfig: false });

    await service.cleanupFolderlessHoneyTokens();

    expect(revokeCredentials).not.toHaveBeenCalled();
    expect(honeyTokenDAL.delete).toHaveBeenCalledWith({ $in: { id: ["a"] } });
  });

  test("resolves the provider connection once per org", async () => {
    const { service, honeyTokenConfigDAL, appConnectionDAL } = buildService({
      rows: [row("a"), row("b"), row("c", { orgId: "org-2" })]
    });

    await service.cleanupFolderlessHoneyTokens();

    expect(revokeCredentials).toHaveBeenCalledTimes(3);
    expect(honeyTokenConfigDAL.findOne).toHaveBeenCalledTimes(2);
    expect(honeyTokenConfigDAL.findOne).toHaveBeenCalledWith({ orgId: "org-2", type: HoneyTokenType.AWS });
    expect(appConnectionDAL.findById).toHaveBeenCalledTimes(2);
  });

  test("project revocation never throws when the provider fails", async () => {
    revokeCredentials.mockRejectedValue(new Error("AWS unavailable"));
    const { service } = buildService({ rows: [row("a")] });

    await expect(service.revokeProjectHoneyTokens("project-1")).resolves.toBeUndefined();
  });
});
