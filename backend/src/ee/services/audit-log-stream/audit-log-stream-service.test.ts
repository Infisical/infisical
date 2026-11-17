import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";

import { LogProvider, StreamMode } from "./audit-log-stream-enums";
import { auditLogStreamServiceFactory, TAuditLogStreamServiceFactoryDep } from "./audit-log-stream-service";
import { TSplunkProviderCredentials } from "./splunk/splunk-provider-types";

const STREAM_ID = "stream-1";
const ORG_ID = "org-1";

const validateCredentials = vi.fn(async ({ credentials }: { credentials: unknown }) => credentials);

vi.mock("./audit-log-stream-factory", () => ({
  LOG_STREAM_FACTORY_MAP: new Proxy(
    {},
    {
      get: () => () => ({ validateCredentials })
    }
  )
}));

const storedCredentials = vi.fn<() => TSplunkProviderCredentials>();

vi.mock("@app/ee/services/audit-log-stream/audit-log-stream-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/ee/services/audit-log-stream/audit-log-stream-fns")>()),
  decryptLogStreamCredentials: async () => storedCredentials(),
  encryptLogStreamCredentials: async () => Buffer.from("encrypted")
}));

const allowAll = { relevantRuleFor: () => ({ inverted: false }) };

const buildService = (permission: unknown = allowAll) => {
  const auditLogStreamDAL = {
    findById: vi.fn(async () => ({
      id: STREAM_ID,
      orgId: ORG_ID,
      provider: LogProvider.Splunk,
      streamMode: StreamMode.Batch,
      encryptedCredentials: Buffer.from("encrypted")
    })),
    updateById: vi.fn(async (id: string) => ({ id, orgId: ORG_ID, provider: LogProvider.Splunk })),
    find: vi.fn(async () => [])
  };

  const licenseService = new FakeLicenseService();
  licenseService.defaultPlan = {
    ...licenseService.defaultPlan,
    auditLogStreams: true,
    auditLogStreamLimit: 5
  };

  const deps = {
    auditLogStreamDAL,
    licenseService,
    permissionService: {
      getOrgPermission: vi.fn(async () => ({ permission }))
    },
    kmsService: {}
  } as unknown as TAuditLogStreamServiceFactoryDep;

  return { service: auditLogStreamServiceFactory(deps), auditLogStreamDAL };
};

const actor = {} as Parameters<ReturnType<typeof auditLogStreamServiceFactory>["updateById"]>[1];

describe("auditLogStreamServiceFactory updateById Splunk port", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCredentials.mockImplementation(async ({ credentials }) => credentials);
  });

  test("keeps the configured port when the update omits it", async () => {
    storedCredentials.mockReturnValue({ hostname: "splunk.example.com", port: 443, token: "token-1" });
    const { service } = buildService();

    const updated = await service.updateById(
      {
        logStreamId: STREAM_ID,
        provider: LogProvider.Splunk,
        credentials: { hostname: "splunk.example.com", token: "token-2" }
      },
      actor
    );

    expect(validateCredentials).toHaveBeenCalledWith({
      credentials: { hostname: "splunk.example.com", port: 443, token: "token-2" }
    });
    expect((updated.credentials as TSplunkProviderCredentials).port).toBe(443);
  });

  test("uses the port from the update when it is provided", async () => {
    storedCredentials.mockReturnValue({ hostname: "splunk.example.com", port: 443, token: "token-1" });
    const { service } = buildService();

    await service.updateById(
      {
        logStreamId: STREAM_ID,
        provider: LogProvider.Splunk,
        credentials: { hostname: "splunk.example.com", port: 9000, token: "token-1" }
      },
      actor
    );

    expect(validateCredentials).toHaveBeenCalledWith({
      credentials: { hostname: "splunk.example.com", port: 9000, token: "token-1" }
    });
  });

  test("leaves the port unset when the stream never had one", async () => {
    storedCredentials.mockReturnValue({ hostname: "splunk.example.com", token: "token-1" });
    const { service } = buildService();

    await service.updateById(
      {
        logStreamId: STREAM_ID,
        provider: LogProvider.Splunk,
        credentials: { hostname: "splunk.example.com", token: "token-1" }
      },
      actor
    );

    expect(validateCredentials).toHaveBeenCalledWith({
      credentials: { hostname: "splunk.example.com", port: undefined, token: "token-1" }
    });
  });
});

describe("auditLogStreamServiceFactory permissions", () => {
  const settingsOnly = createMongoAbility([{ action: ["read", "create", "edit", "delete"], subject: "settings" }]);

  test.each([
    [
      "create",
      (service: ReturnType<typeof buildService>["service"]) =>
        service.create({ provider: LogProvider.Splunk, credentials: { hostname: "h", token: "t" } }, actor)
    ],
    [
      "updateById",
      (service: ReturnType<typeof buildService>["service"]) =>
        service.updateById(
          { logStreamId: STREAM_ID, provider: LogProvider.Splunk, credentials: { hostname: "h", token: "t" } },
          actor
        )
    ],
    [
      "deleteById",
      (service: ReturnType<typeof buildService>["service"]) => service.deleteById(STREAM_ID, LogProvider.Splunk, actor)
    ],
    [
      "getById",
      (service: ReturnType<typeof buildService>["service"]) => service.getById(STREAM_ID, LogProvider.Splunk, actor)
    ],
    ["list", (service: ReturnType<typeof buildService>["service"]) => service.list(actor)]
  ])("%s rejects a role that only has organization profile access", async (_name, call) => {
    const { service } = buildService(settingsOnly);

    await expect(call(service)).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("list allows a role with read on audit log streams", async () => {
    const { service } = buildService(createMongoAbility([{ action: "read", subject: "audit-log-streams" }]));

    await expect(service.list(actor)).resolves.toEqual([]);
  });

  test("create rejects a role with only read on audit log streams", async () => {
    const { service } = buildService(createMongoAbility([{ action: "read", subject: "audit-log-streams" }]));

    await expect(
      service.create({ provider: LogProvider.Splunk, credentials: { hostname: "h", token: "t" } }, actor)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
