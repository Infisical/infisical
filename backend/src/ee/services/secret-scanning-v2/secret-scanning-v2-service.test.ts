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

const buildService = (
  transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>,
  permissionRules: { action: string; subject: string }[] = [{ action: "manage", subject: "all" }]
) => {
  const cipher = {
    createCipherPairWithDataKey: vi.fn(async () => ({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText })
    }))
  };
  const overrides: Record<string, unknown> = {
    licenseService: { getPlan: vi.fn(async () => ({ has: () => true })) },
    permissionService: {
      getProjectPermission: vi.fn(async () => ({
        permission: createMongoAbility(permissionRules)
      }))
    },
    secretScanningV2DAL: {
      dataSources: {
        transaction: vi.fn(transaction),
        create: vi.fn(async () => ({ id: "ds-1" }))
      }
    },
    kmsDataKeyService: { ...cipher, within: vi.fn(() => cipher) },
    projectDAL: { findById: vi.fn(async () => ({ id: "project-1", orgId: "org-1" })) },
    alertService: {
      prepareDefaultAlert: vi.fn(async ({ eventType }: { eventType: string }) => ({ eventType })),
      prepareAlertForNewResource: vi.fn(async ({ eventType }: { eventType: string }) => ({ eventType })),
      applyPreparedAlert: vi.fn(async () => {})
    }
  };
  const deps = new Proxy(overrides, {
    get: (target, key: string) => (key in target ? target[key] : new Proxy({}, { get: () => vi.fn() }))
  });

  const service = secretScanningV2ServiceFactory(
    deps as unknown as Parameters<typeof secretScanningV2ServiceFactory>[0]
  );
  return {
    service,
    dataSourceDAL: (overrides.secretScanningV2DAL as { dataSources: { create: unknown } }).dataSources,
    alertService: overrides.alertService as {
      prepareDefaultAlert: ReturnType<typeof vi.fn>;
      prepareAlertForNewResource: ReturnType<typeof vi.fn>;
      applyPreparedAlert: ReturnType<typeof vi.fn>;
    }
  };
};

const DTO = {
  type: SecretScanningDataSource.Bitbucket,
  name: "source",
  projectId: "project-1",
  config: { workspaceSlug: "ws" },
  isAutoScanEnabled: false
};

const runCreate = (service: ReturnType<typeof buildService>["service"], dto: Record<string, unknown> = {}) =>
  service.createSecretScanningDataSource({ ...DTO, ...dto } as never, actor as never);

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

describe("createSecretScanningDataSource default alerts", () => {
  test("gives every new data source its default alerts, bound to it", async () => {
    factory.teardown.mockReset();
    factory.postInitialization.mockReset();
    factory.initialize.mockImplementation(async (_params: unknown, callback: (p: unknown) => Promise<unknown>) =>
      callback({ credentials })
    );
    const { service, dataSourceDAL, alertService } = buildService(async (fn) =>
      fn({ executionPromise: Promise.resolve() })
    );

    await runCreate(service);

    const [[created]] = (dataSourceDAL.create as ReturnType<typeof vi.fn>).mock.calls as [[{ id: string }]];
    const prepared = alertService.prepareDefaultAlert.mock.calls.map(([dto]) => dto as { resourceId: string });
    expect(prepared).toEqual([
      expect.objectContaining({ resourceId: created.id, eventType: "secret-scanning.data-source.secrets-detected" }),
      expect.objectContaining({ resourceId: created.id, eventType: "secret-scanning.data-source.scan-failed" })
    ]);
    expect(alertService.applyPreparedAlert).toHaveBeenCalledTimes(2);
  });

  const emailToAdmins = {
    name: "Email",
    channelType: "email",
    config: {},
    recipients: [{ principalType: "project-admins", principalId: "project-1" }]
  };

  const createdWith = async (dto: Record<string, unknown>, permissionRules?: { action: string; subject: string }[]) => {
    factory.teardown.mockReset();
    factory.postInitialization.mockReset();
    factory.initialize.mockImplementation(async (_params: unknown, callback: (p: unknown) => Promise<unknown>) =>
      callback({ credentials })
    );
    const built = buildService(async (fn) => fn({ executionPromise: Promise.resolve() }), permissionRules);
    const result = runCreate(built.service, dto);
    return { ...built, result };
  };

  test("creates the alerts its creator chose instead of the defaults", async () => {
    const { result, dataSourceDAL, alertService } = await createdWith({
      alerts: [{ eventType: "secret-scanning.data-source.scan-failed", channels: [emailToAdmins] }]
    });
    await result;

    expect(alertService.prepareDefaultAlert).not.toHaveBeenCalled();
    const [[created]] = (dataSourceDAL.create as ReturnType<typeof vi.fn>).mock.calls as [[Record<string, unknown>]];
    expect(created).not.toHaveProperty("alerts");
    expect(alertService.prepareAlertForNewResource.mock.calls.map(([dto]) => dto as unknown)).toEqual([
      expect.objectContaining({
        resourceId: created.id,
        projectId: "project-1",
        eventType: "secret-scanning.data-source.scan-failed",
        name: "Secret scanning failed",
        channels: [emailToAdmins],
        actorId: "user-1"
      })
    ]);
    expect(alertService.applyPreparedAlert).toHaveBeenCalledTimes(1);
  });

  test("creates no alerts when given an empty list", async () => {
    const { result, alertService } = await createdWith({ alerts: [] });
    await result;

    expect(alertService.prepareDefaultAlert).not.toHaveBeenCalled();
    expect(alertService.applyPreparedAlert).not.toHaveBeenCalled();
  });

  test("refuses chosen alerts to a creator who can't edit data sources, before creating anything", async () => {
    const { result, dataSourceDAL } = await createdWith({ alerts: [] }, [
      { action: "create-data-sources", subject: "secret-scanning-data-sources" },
      { action: "read-data-sources", subject: "secret-scanning-data-sources" }
    ]);

    await expect(result).rejects.toThrow("requires permission to edit data sources");
    expect(dataSourceDAL.create).not.toHaveBeenCalled();
  });
});
