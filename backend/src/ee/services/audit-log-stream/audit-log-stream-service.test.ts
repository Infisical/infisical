import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import { ConflictError, ForbiddenRequestError } from "@app/lib/errors";

import { PamProductRole } from "../pam/pam-enums";
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
    primaryNode: vi.fn(),
    lockById: vi.fn(async () => ({ id: STREAM_ID, filters: null })),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
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
    kmsDataKeyService: {}
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

describe("auditLogStreamServiceFactory PAM session activity", () => {
  const credentials = { hostname: "splunk.example.com", port: 443, token: "token-1" };
  const sessionActivity = { pamSessionActivity: { includeOutput: false } };

  const buildPamService = ({
    pamRole,
    storedFilters = null,
    lockedFilters = storedFilters
  }: {
    pamRole: "admin" | "member" | "outsider";
    storedFilters?: unknown;
    lockedFilters?: unknown;
  }) => {
    const auditLogStreamDAL = {
      findById: vi.fn(async () => ({
        id: STREAM_ID,
        orgId: ORG_ID,
        provider: LogProvider.Splunk,
        streamMode: StreamMode.Batch,
        encryptedCredentials: Buffer.from("encrypted"),
        filters: storedFilters
      })),
      updateById: vi.fn(async (id: string) => ({ id, orgId: ORG_ID, provider: LogProvider.Splunk })),
      primaryNode: vi.fn(),
      lockById: vi.fn(async () => ({ id: STREAM_ID, filters: lockedFilters })),
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
      create: vi.fn(async () => ({ id: STREAM_ID, orgId: ORG_ID, provider: LogProvider.Splunk })),
      find: vi.fn(async () => [])
    };

    const licenseService = new FakeLicenseService();
    licenseService.defaultPlan = { ...licenseService.defaultPlan, auditLogStreams: true, auditLogStreamLimit: 5 };

    const getProjectPermission = vi.fn(async () => {
      if (pamRole === "outsider") throw new ForbiddenRequestError({ message: "Not a member of this project" });
      return { hasRole: (role: string) => pamRole === "admin" && role === PamProductRole.Admin };
    });

    const deps = {
      auditLogStreamDAL,
      licenseService,
      permissionService: { getOrgPermission: vi.fn(async () => ({ permission: allowAll })), getProjectPermission },
      kmsDataKeyService: {},
      pamProjectResolver: { findDefaultProjectId: vi.fn(async () => "pam-project") }
    } as unknown as TAuditLogStreamServiceFactoryDep;

    return { service: auditLogStreamServiceFactory(deps), auditLogStreamDAL, getProjectPermission };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    validateCredentials.mockImplementation(async ({ credentials: c }) => c);
  });

  test("refuses a stream that receives session activity unless a PAM product admin creates it", async () => {
    const member = buildPamService({ pamRole: "member" });
    const outsider = buildPamService({ pamRole: "outsider" });
    const admin = buildPamService({ pamRole: "admin" });
    const dto = { provider: LogProvider.Splunk, credentials, filters: sessionActivity };

    await expect(member.service.create(dto, actor)).rejects.toThrow(ForbiddenRequestError);
    await expect(outsider.service.create(dto, actor)).rejects.toThrow(ForbiddenRequestError);
    await admin.service.create(dto, actor);

    expect(member.auditLogStreamDAL.create).not.toHaveBeenCalled();
    expect(outsider.auditLogStreamDAL.create).not.toHaveBeenCalled();
    expect(admin.auditLogStreamDAL.create).toHaveBeenCalled();
  });

  test("refuses any edit of a stream that sends session activity by someone who isn't a PAM product admin", async () => {
    const { service, auditLogStreamDAL } = buildPamService({ pamRole: "member", storedFilters: sessionActivity });

    await expect(
      service.updateById({ logStreamId: STREAM_ID, provider: LogProvider.Splunk, credentials }, actor)
    ).rejects.toThrow(ForbiddenRequestError);
    expect(auditLogStreamDAL.updateById).not.toHaveBeenCalled();
  });

  test("refuses an edit if session activity was turned on while its credentials were tested", async () => {
    const { service, auditLogStreamDAL } = buildPamService({ pamRole: "member", lockedFilters: sessionActivity });

    await expect(
      service.updateById({ logStreamId: STREAM_ID, provider: LogProvider.Splunk, credentials }, actor)
    ).rejects.toThrow(ConflictError);
    expect(auditLogStreamDAL.updateById).not.toHaveBeenCalled();
  });

  test("leaves streams without session activity to the org permission alone", async () => {
    const { service, getProjectPermission } = buildPamService({ pamRole: "member" });

    await service.create({ provider: LogProvider.Splunk, credentials, filters: { products: [] } }, actor);
    await service.updateById({ logStreamId: STREAM_ID, provider: LogProvider.Splunk, credentials }, actor);

    expect(getProjectPermission).not.toHaveBeenCalled();
  });
});
