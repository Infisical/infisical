import { beforeEach, describe, expect, test, vi } from "vitest";

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

const buildService = () => {
  const auditLogStreamDAL = {
    findById: vi.fn(async () => ({
      id: STREAM_ID,
      orgId: ORG_ID,
      provider: LogProvider.Splunk,
      streamMode: StreamMode.Batch,
      encryptedCredentials: Buffer.from("encrypted")
    })),
    updateById: vi.fn(async (id: string) => ({ id, orgId: ORG_ID, provider: LogProvider.Splunk }))
  };

  const deps = {
    auditLogStreamDAL,
    licenseService: { getPlan: vi.fn(async () => ({ auditLogStreams: true, auditLogStreamLimit: 5 })) },
    permissionService: {
      getOrgPermission: vi.fn(async () => ({ permission: { relevantRuleFor: () => ({ inverted: false }) } }))
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
