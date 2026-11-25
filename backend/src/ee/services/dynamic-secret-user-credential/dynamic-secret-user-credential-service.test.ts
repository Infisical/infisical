import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecretUserCredentials } from "@app/db/schemas";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { dynamicSecretUserCredentialServiceFactory } from "./dynamic-secret-user-credential-service";
import {
  DynamicSecretUserCredentialStatus,
  TDynamicSecretUserCredentialSecrets,
  TUserTokenRefreshResult,
  USER_REAUTHORIZATION_REQUIRED_ERROR_NAME
} from "./dynamic-secret-user-credential-types";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ isDevelopmentMode: false })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (url: string) => url
}));

const dynamicSecret = { id: "ds-1", name: "google-users" };
const HOUR_MS = 3_600_000;

const seal = (secrets: TDynamicSecretUserCredentialSecrets) => Buffer.from(JSON.stringify(secrets));
const unseal = (row: TDynamicSecretUserCredentials) =>
  JSON.parse(row.encryptedCredentials.toString()) as TDynamicSecretUserCredentialSecrets;

const createService = (initial: Partial<TDynamicSecretUserCredentials> | null = {}) => {
  const rows = new Map<string, TDynamicSecretUserCredentials>();
  if (initial) {
    const row = {
      id: "uc-1",
      dynamicSecretId: dynamicSecret.id,
      externalUserId: "user-1",
      encryptedCredentials: seal({ accessToken: "access-1", refreshToken: "refresh-1", tokenType: "Bearer" }),
      accessTokenExpiresAt: new Date(Date.now() + HOUR_MS),
      status: DynamicSecretUserCredentialStatus.Active,
      statusDetails: null,
      lastRefreshedAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...initial
    };
    rows.set(row.id, row);
  }

  const dal = {
    findByExternalUserId: vi.fn(async (dynamicSecretId: string, externalUserId: string) =>
      [...rows.values()].find((r) => r.dynamicSecretId === dynamicSecretId && r.externalUserId === externalUserId)
    ),
    updateIfVersion: vi.fn(
      async (id: string, expectedVersion: number, data: Partial<TDynamicSecretUserCredentials>) => {
        const row = rows.get(id);
        if (!row || row.version !== expectedVersion) return undefined;
        const updated = { ...row, ...data, version: row.version + 1 };
        rows.set(id, updated);
        return updated;
      }
    )
  };

  // a real mutex, so concurrent calls queue the way they do on the Redis lock
  let held: Promise<void> = Promise.resolve();
  const keyStore = {
    acquireLock: vi.fn(async () => {
      let release!: () => void;
      const previous = held;
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      return { release: async () => release() };
    })
  };

  const service = dynamicSecretUserCredentialServiceFactory({
    dynamicSecretUserCredentialDAL: dal as never,
    dynamicSecretDAL: { findOne: vi.fn() } as never,
    folderDAL: { findBySecretPath: vi.fn() } as never,
    projectDAL: { findProjectBySlug: vi.fn() } as never,
    permissionService: { getProjectPermission: vi.fn() } as never,
    licenseService: new FakeLicenseService().setPlan("org-1", { dynamicSecret: true }),
    kmsDataKeyService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      }))
    } as never,
    keyStore: keyStore as never
  });

  return { service, rows, dal, keyStore };
};

const refreshed = (accessToken: string, extra: Partial<TUserTokenRefreshResult> = {}): TUserTokenRefreshResult =>
  ({
    status: "refreshed",
    accessToken,
    requestedAt: Date.now(),
    expiresAt: Date.now() + HOUR_MS,
    ...extra
  }) as TUserTokenRefreshResult;

const issue = (
  service: ReturnType<typeof createService>["service"],
  refresh: ReturnType<typeof vi.fn>,
  leaseMs = 300_000
) =>
  service.issueAccessToken({
    dynamicSecret,
    projectId: "proj-1",
    externalUserId: "user-1",
    leaseEndsAt: Date.now() + leaseMs,
    refresh: refresh as never
  });

describe("dynamicSecretUserCredentialService.issueAccessToken", () => {
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    refresh = vi.fn();
  });

  test("returns the stored access token while it outlives the lease", async () => {
    const { service, keyStore } = createService();

    await expect(issue(service, refresh)).resolves.toMatchObject({ accessToken: "access-1", tokenType: "Bearer" });
    expect(refresh).not.toHaveBeenCalled();
    expect(keyStore.acquireLock).not.toHaveBeenCalled();
  });

  test("refreshes when the access token would expire before the lease ends, and stores the rotated refresh token", async () => {
    const { service, rows } = createService({ accessTokenExpiresAt: new Date(Date.now() + 60_000) });
    refresh.mockResolvedValueOnce(refreshed("access-2", { refreshToken: "refresh-2" }));

    await expect(issue(service, refresh)).resolves.toMatchObject({ accessToken: "access-2" });

    expect(refresh).toHaveBeenCalledWith("refresh-1");
    const row = rows.get("uc-1")!;
    expect(unseal(row)).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-2", tokenType: "Bearer" });
    expect(row.lastRefreshedAt).toBeInstanceOf(Date);
    expect(row.version).toBe(2);
  });

  test("keeps the old refresh token when the server doesn't issue a new one", async () => {
    const { service, rows } = createService({ accessTokenExpiresAt: null });
    refresh.mockResolvedValueOnce(refreshed("access-2"));

    await issue(service, refresh);

    expect(unseal(rows.get("uc-1")!).refreshToken).toBe("refresh-1");
  });

  test("refreshes once when two leases need a new token at the same time", async () => {
    const { service } = createService({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
    refresh.mockImplementation(async () => refreshed("access-2", { refreshToken: "refresh-2" }));

    const [first, second] = await Promise.all([issue(service, refresh), issue(service, refresh)]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(first.accessToken).toBe("access-2");
    expect(second.accessToken).toBe("access-2");
  });

  test("marks the user for reauthorization when the server rejects the refresh token, and stops refreshing", async () => {
    const { service, rows } = createService({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
    refresh.mockResolvedValueOnce({ status: "rejected", reason: "The server rejected the stored refresh token." });

    const error = await issue(service, refresh).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).name).toBe(USER_REAUTHORIZATION_REQUIRED_ERROR_NAME);
    expect(rows.get("uc-1")).toMatchObject({
      status: DynamicSecretUserCredentialStatus.ReauthorizationRequired,
      statusDetails: "The server rejected the stored refresh token."
    });

    await expect(issue(service, refresh)).rejects.toThrow("has to authorize your application again");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("keeps tokens the application stored while a refresh was in flight", async () => {
    const { service, rows } = createService({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
    refresh.mockImplementationOnce(async () => {
      const row = rows.get("uc-1")!;
      rows.set("uc-1", {
        ...row,
        encryptedCredentials: seal({ accessToken: "from-application", refreshToken: "refresh-app" }),
        accessTokenExpiresAt: new Date(Date.now() + HOUR_MS),
        version: row.version + 1
      });
      return refreshed("from-refresh", { refreshToken: "refresh-2" });
    });

    await expect(issue(service, refresh)).resolves.toMatchObject({ accessToken: "from-application" });
    expect(unseal(rows.get("uc-1")!).refreshToken).toBe("refresh-app");
  });

  test("returns 404 when no tokens are stored for the user", async () => {
    const { service } = createService(null);
    await expect(issue(service, refresh)).rejects.toBeInstanceOf(NotFoundError);
  });
});
