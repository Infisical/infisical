import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { SecretScanningDataSource } from "./secret-scanning-v2-enums";
import { secretScanningV2ServiceFactory } from "./secret-scanning-v2-service";

const factory = {
  initialize: vi.fn(),
  postInitialization: vi.fn(),
  teardown: vi.fn()
};

vi.mock("./secret-scanning-v2-factory", () => ({
  SECRET_SCANNING_FACTORY_MAP: new Proxy({}, { get: () => () => factory })
}));

const actor = {
  type: ActorType.USER,
  id: "user-1",
  authMethod: AuthMethod.EMAIL,
  orgId: "org-1",
  rootOrgId: "org-1",
  parentOrgId: "org-1"
};

const credentials = { webhookId: "hook-1", webhookSecret: "secret" };

const buildService = (transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>) => {
  const cipher = {
    createCipherPairWithDataKey: vi.fn(async () => ({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText })
    }))
  };
  const overrides: Record<string, unknown> = {
    licenseService: { getPlan: vi.fn(async () => ({ has: () => true })) },
    permissionService: {
      getProjectPermission: vi.fn(async () => ({
        permission: createMongoAbility([{ action: "manage", subject: "all" }])
      }))
    },
    secretScanningV2DAL: {
      dataSources: {
        transaction: vi.fn(transaction),
        create: vi.fn(async () => ({ id: "ds-1" }))
      }
    },
    kmsDataKeyService: { ...cipher, within: vi.fn(() => cipher) }
  };
  const deps = new Proxy(overrides, {
    get: (target, key: string) => (key in target ? target[key] : new Proxy({}, { get: () => vi.fn() }))
  });

  const service = secretScanningV2ServiceFactory(
    deps as unknown as Parameters<typeof secretScanningV2ServiceFactory>[0]
  );
  return {
    service,
    dataSourceDAL: (overrides.secretScanningV2DAL as { dataSources: { create: unknown } }).dataSources
  };
};

const DTO = {
  type: SecretScanningDataSource.Bitbucket,
  name: "source",
  projectId: "project-1",
  config: { workspaceSlug: "ws" },
  isAutoScanEnabled: false
};

const runCreate = (service: ReturnType<typeof buildService>["service"]) =>
  service.createSecretScanningDataSource(DTO as never, actor as never);

describe("createSecretScanningDataSource", () => {
  test("removes the provider webhook when the transaction fails", async () => {
    factory.teardown.mockReset();
    factory.postInitialization.mockReset();
    factory.initialize.mockImplementation(async (_params: unknown, callback: (p: unknown) => Promise<unknown>) =>
      callback({ credentials })
    );
    factory.postInitialization.mockRejectedValue(new Error("provider update failed"));

    const { service } = buildService(async (fn) => fn({ executionPromise: Promise.resolve() }));

    await expect(runCreate(service)).rejects.toThrow("provider update failed");

    expect(factory.teardown).toHaveBeenCalledTimes(1);
    expect(factory.teardown).toHaveBeenCalledWith(expect.objectContaining({ credentials }));
  });

  test("removes the provider webhook when the commit itself fails", async () => {
    factory.teardown.mockReset();
    factory.postInitialization.mockReset();
    factory.initialize.mockImplementation(async (_params: unknown, callback: (p: unknown) => Promise<unknown>) =>
      callback({ credentials })
    );

    const { service } = buildService(async (fn) => {
      await fn({ executionPromise: Promise.resolve() });
      throw new Error("commit failed");
    });

    await expect(runCreate(service)).rejects.toThrow("commit failed");

    expect(factory.teardown).toHaveBeenCalledTimes(1);
  });

  test("does not tear down when the data source is created", async () => {
    factory.teardown.mockReset();
    factory.postInitialization.mockReset();
    factory.initialize.mockImplementation(async (_params: unknown, callback: (p: unknown) => Promise<unknown>) =>
      callback({ credentials })
    );

    const { service } = buildService(async (fn) => fn({ executionPromise: Promise.resolve() }));

    await expect(runCreate(service)).resolves.toEqual({ id: "ds-1" });

    expect(factory.postInitialization).toHaveBeenCalledTimes(1);
    expect(factory.teardown).not.toHaveBeenCalled();
  });
});
