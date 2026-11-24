import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { RuleViolationError } from "@app/domains/lib/errors";
import { FakeLicenseService } from "@app/domains/platform/license/ce/testing/fake-license-service";
import {
  agentVaultProjectAdminPermissions,
  agentVaultProjectMemberPermissions
} from "@app/ee/services/permission/default-roles";
import { ConflictError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import { AGENT_VAULT_SERVICE_MOVED_MESSAGE } from "../agent-vault-oauth/agent-vault-oauth-service";
import { TRefreshServiceTokenDTO } from "../agent-vault-oauth/agent-vault-oauth-types";
import { TAgentVaultInlineServiceSecretsRow } from "../agent-vault-session/agent-vault-session-inline-service-dal";
import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultServiceType
} from "../agent-vault/agent-vault-enums";
import { agentVaultProxyServiceFactory } from "./agent-vault-proxy-service";
import { TResolveServiceRow } from "./agent-vault-resolve-dal";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/services/object-storage/object-storage-default-fns", () => ({
  isDefaultStorageConfigured: () => false
}));

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SERVICE_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_URL = "https://mcp.linear.app/mcp";

const serviceRow = (overrides: Partial<TResolveServiceRow> = {}): TResolveServiceRow => ({
  id: SERVICE_ID,
  name: "linear",
  description: null,
  accessBundleId: "bundle-1",
  accessBundleName: "bundle",
  type: AgentVaultServiceType.Mcp,
  hostPattern: "mcp.linear.app",
  config: { serverUrl: SERVER_URL, transport: "streamable-http" },
  credentialType: AgentVaultCredentialType.OAuth,
  credentialConfig: {
    status: AgentVaultOauthStatus.Connected,
    // Inside the refresh horizon, so resolve refreshes it.
    expiresAt: new Date(Date.now() + 10_000).toISOString()
  },
  encryptedCredential: Buffer.from(JSON.stringify({ accessToken: "snapshot-access" })),
  allowedMethods: null,
  allowedPathPrefixes: null,
  allowedTools: null,
  memberProvidedFields: null,
  hookId: null,
  hookMethods: null,
  hookPaths: null,
  hookTools: null,
  position: 0,
  ...overrides
});

const agentVaultAccess = (freeLimitReached = false) => ({
  assertCanBroker: vi.fn(async () => {
    if (freeLimitReached) {
      throw new RuleViolationError({ name: "AgentVaultFreeLimitReached", message: "free limit reached" });
    }
  })
});

const sessionLogConfig = {
  id: "logs-config",
  projectId: PROJECT_ID,
  enabled: false,
  storageType: ObjectStorageType.Default,
  createdAt: new Date(),
  updatedAt: new Date()
};

const setup = (
  refresh: (dto: TRefreshServiceTokenDTO) => Promise<unknown>,
  rows = [serviceRow()],
  variables: { id: string; encryptedValue: Buffer }[] = [],
  {
    inlineRows = [],
    oauthVariables = [],
    isOwnerAdmin = true,
    revokedAt = null,
    label = null,
    onlyOnPrimary = false,
    personalRows = [],
    session = {},
    hooks = [],
    hooksOnlyOnPrimary = false,
    licenseService = new FakeLicenseService(),
    metadata = {},
    freeLimitReached = false,
    proxy = {
      projectId: PROJECT_ID,
      orgId: "org-1",
      pollInterval: 60,
      name: "prod-proxy",
      trafficPolicy: "bundle-hosts"
    }
  }: {
    inlineRows?: TAgentVaultInlineServiceSecretsRow[];
    // The project's global OAuth variables.
    oauthVariables?: { id: string; key: string; encryptedValue: Buffer | null; oauthConfig: unknown }[];
    isOwnerAdmin?: boolean;
    revokedAt?: Date | null;
    label?: string | null;
    // The session was minted a moment ago and hasn't reached the replica.
    onlyOnPrimary?: boolean;
    freeLimitReached?: boolean;
    personalRows?: { serviceId: string; field: string; encryptedValue: Buffer; oauthConfig: unknown }[];
    session?: Record<string, unknown>;
    hooks?: { id: string; name: string; url: string; encryptedSecret: Buffer }[];
    // The hooks were written a moment ago and haven't reached the replica the resolve read from.
    hooksOnlyOnPrimary?: boolean;
    licenseService?: FakeLicenseService;
    metadata?: Record<string, string>;
    proxy?: {
      projectId: string;
      orgId: string;
      pollInterval: number;
      name: string;
      trafficPolicy: string;
      allowedHosts?: string | null;
    };
  } = {}
) => {
  const findCaFingerprintsByProjectId = vi.fn(async () => ["SHA256:AA:BB"]);
  // The stored token version is 1; the DAL's update matches no row for any other.
  const recordHeartbeat = vi.fn(async (_proxyId: string, tokenVersion: number) =>
    tokenVersion === 1 ? { id: "proxy-1", pollInterval: 60, heartbeatTTL: 60 } : undefined
  );
  const refreshServiceToken = vi.fn(refresh);
  const reportMissingScopes = vi.fn(async () => {});
  const findInlineServices = vi.fn(async () => inlineRows);
  const findOauthForResolve = vi.fn(async ({ variableIds }: { variableIds: string[] }) =>
    oauthVariables.filter((variable) => variableIds.includes(variable.id))
  );
  const findResolvableServices = vi.fn(async () => rows);
  const findReachableBundles = vi.fn(async () => [{ id: "bundle-1", name: "bundle" }]);
  const findHooks = vi.fn(async ({ hookIds, onPrimary }: { hookIds: string[]; onPrimary?: boolean }) =>
    hooksOnlyOnPrimary && !onPrimary ? [] : hooks.filter((hook) => hookIds.includes(hook.id))
  );
  const findSessionMetadata = vi.fn(async () => metadata);
  const sessionRow = {
    id: "session-1",
    projectId: PROJECT_ID,
    userId: "user-1",
    revokedAt,
    expiresAt: null,
    label,
    ...session
  };
  const findSession = async () => (onlyOnPrimary ? undefined : sessionRow) as never;
  const findSessionOnPrimary = vi.fn(async () => sessionRow as never);
  const createCipherPairWithDataKey = vi.fn(
    async () => ({ decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob }) as never
  );
  const agentVaultAccessService = agentVaultAccess(freeLimitReached);
  const service = agentVaultProxyServiceFactory({
    agentVaultProxyDAL: {
      findByIdWithOrg: async () => proxy,
      findCaFingerprintsByProjectId,
      recordHeartbeat
    } as never,
    agentVaultResolveDAL: {
      findResolvableServices,
      findSessionSkills: async () => [],
      findReachableBundles,
      findHooks,
      findSessionMetadata
    } as never,
    agentVaultServiceCustomHeaderDAL: { findByServiceIds: async () => [] },
    agentVaultServiceSubstitutionDAL: { findByServiceIds: async () => [] },
    agentVaultVariableDAL: { findValuesForResolve: async () => variables, findOauthForResolve },
    agentVaultPersonalValueDAL: { findForResolve: async () => personalRows },
    agentVaultSessionDAL: {
      findByTokenHash: findSession,
      findByTokenHashOnPrimary: findSessionOnPrimary
    } as never,
    agentVaultSessionInlineServiceDAL: {
      findBySessionId: findInlineServices,
      deleteSecretsBySessionId: async () => {}
    },
    agentVaultSessionInlineSkillDAL: {
      findWithFilesBySessionId: async () => [],
      deleteFilesBySessionId: async () => {}
    },
    agentVaultDelegationDAL: { identityCoversUser: async () => false },
    agentVaultSessionLogConfigDAL: {
      findOne: async () => sessionLogConfig,
      findByProjectIdFromPrimary: async () => sessionLogConfig
    },
    membershipDAL: { findResourceMembershipsForActor: async () => [] },
    orgDAL: { findEffectiveOrgMembership: async () => ({ isActive: true }) as never },
    projectDAL: { findById: async () => ({ id: PROJECT_ID, orgId: "org-1" }) as never },
    userDAL: { findById: async () => undefined as never },
    permissionService: {
      getProjectPermission: async () =>
        ({
          permission: createMongoAbility(
            isOwnerAdmin ? agentVaultProjectAdminPermissions : agentVaultProjectMemberPermissions
          ),
          hasRole: () => isOwnerAdmin,
          memberships: []
        }) as never
    },
    kmsDataKeyService: { createCipherPairWithDataKey } as never,
    licenseService,
    agentVaultAccessService,
    resourceAuthMethodService: {} as never,
    agentVaultOauthService: {
      refreshServiceToken: refreshServiceToken as never,
      reportMissingScopes: reportMissingScopes as never
    }
  });
  return {
    service,
    findSessionOnPrimary,
    recordHeartbeat,
    refreshServiceToken,
    reportMissingScopes,
    findInlineServices,
    findOauthForResolve,
    findResolvableServices,
    findReachableBundles,
    findHooks,
    findSessionMetadata,
    createCipherPairWithDataKey,
    findCaFingerprintsByProjectId,
    agentVaultAccessService
  };
};

const refreshed = {
  credential: {
    type: "bearer",
    headerName: "Authorization",
    headerPrefix: "Bearer",
    value: "refreshed-access",
    source: "oauth",
    expiresAt: null
  },
  status: AgentVaultOauthStatus.Connected
};

const refreshArgs = {
  proxyId: "proxy-1",
  orgId: "org-1",
  sessionToken: "token",
  serviceId: SERVICE_ID,
  rejectedTokenHash: "a".repeat(64)
};

describe("credential refresh", () => {
  test("a host pattern that no longer matches the service is a 409, before any refresh", async () => {
    const { service, refreshServiceToken } = setup(async () => refreshed);
    const result = service.refreshCredential({ ...refreshArgs, hostPattern: "old.example.com" });
    await expect(result).rejects.toThrow(ConflictError);
    await expect(result).rejects.toThrow(AGENT_VAULT_SERVICE_MOVED_MESSAGE);
    expect(refreshServiceToken).not.toHaveBeenCalled();
  });

  test("a matching host pattern is passed on, so the refresh re-checks it on the rows it reads", async () => {
    const { service, refreshServiceToken } = setup(async () => refreshed);
    await expect(service.refreshCredential({ ...refreshArgs, hostPattern: "mcp.linear.app" })).resolves.toEqual(
      refreshed
    );
    expect(refreshServiceToken.mock.calls[0][0].destination).toEqual({ hostPattern: "mcp.linear.app" });
  });
});

describe("an org past its free Agent Vault requests", () => {
  test("resolve refuses with AgentVaultFreeLimitReached and hands out no credential", async () => {
    const { service, refreshServiceToken, createCipherPairWithDataKey } = setup(async () => refreshed, undefined, [], {
      freeLimitReached: true
    });
    const result = service.resolveSession({
      proxyId: "proxy-1",
      orgId: "org-1",
      sessionToken: "token",
      hasSessionLogKey: false
    });
    await expect(result).rejects.toMatchObject({ name: "AgentVaultFreeLimitReached" });
    expect(refreshServiceToken).not.toHaveBeenCalled();
    expect(createCipherPairWithDataKey).not.toHaveBeenCalled();
  });

  test("credential refresh refuses before refreshing", async () => {
    const { service, refreshServiceToken } = setup(async () => refreshed, undefined, [], { freeLimitReached: true });
    const result = service.refreshCredential({ ...refreshArgs, hostPattern: "mcp.linear.app" });
    await expect(result).rejects.toMatchObject({ name: "AgentVaultFreeLimitReached" });
    expect(refreshServiceToken).not.toHaveBeenCalled();
  });

  test("the heartbeat never checks the free limit, so the proxy keeps running", async () => {
    const { service, recordHeartbeat, agentVaultAccessService } = setup(async () => refreshed, undefined, [], {
      freeLimitReached: true
    });
    await service.heartbeat({ proxyId: "proxy-1", tokenVersion: 1 });
    expect(recordHeartbeat).toHaveBeenCalled();
    expect(agentVaultAccessService.assertCanBroker).not.toHaveBeenCalled();
  });

  test("a session the proxy doesn't own is a 404, not the free limit refusal", async () => {
    const { service, agentVaultAccessService } = setup(async () => refreshed, undefined, [], {
      freeLimitReached: true,
      proxy: { projectId: "other-project", orgId: "org-1", pollInterval: 60, name: "theirs", trafficPolicy: "any-host" }
    });
    const result = service.resolveSession({
      proxyId: "proxy-1",
      orgId: "org-1",
      sessionToken: "token",
      hasSessionLogKey: false
    });
    await expect(result).rejects.toThrow(NotFoundError);
    expect(agentVaultAccessService.assertCanBroker).not.toHaveBeenCalled();
  });
});

describe("missing scopes report", () => {
  test("a host pattern that no longer matches the service is a 409, before anything is recorded", async () => {
    const { service, reportMissingScopes } = setup(async () => refreshed);
    const result = service.reportMissingScopes({
      ...refreshArgs,
      hostPattern: "old.example.com",
      requiredScopes: ["admin"]
    });
    await expect(result).rejects.toThrow(AGENT_VAULT_SERVICE_MOVED_MESSAGE);
    expect(reportMissingScopes).not.toHaveBeenCalled();
  });

  test("records the scopes against the rejected token without refreshing", async () => {
    const { service, refreshServiceToken, reportMissingScopes } = setup(async () => refreshed);
    await service.reportMissingScopes({
      ...refreshArgs,
      rejectedTokenHash: "A".repeat(64),
      hostPattern: "mcp.linear.app",
      requiredScopes: ["admin"]
    });
    expect(reportMissingScopes).toHaveBeenCalledWith({
      serviceId: SERVICE_ID,
      rejectedTokenHash: "a".repeat(64),
      requiredScopes: ["admin"],
      hostPattern: "mcp.linear.app"
    });
    expect(refreshServiceToken).not.toHaveBeenCalled();
  });
});

describe("resolve's lazy refresh", () => {
  const resolve = (service: ReturnType<typeof setup>["service"]) =>
    service.resolveSession({ proxyId: "proxy-1", orgId: "org-1", sessionToken: "token", hasSessionLogKey: false });

  test("pins the refresh to the snapshot's host and server URL, and sends what it returns", async () => {
    const { service, refreshServiceToken } = setup(async () => refreshed);
    const { services } = await resolve(service);
    expect(refreshServiceToken.mock.calls[0][0].destination).toEqual({
      hostPattern: "mcp.linear.app",
      serverUrl: SERVER_URL
    });
    expect(services[0]).toMatchObject({ hostPattern: "mcp.linear.app", credential: { value: "refreshed-access" } });
  });

  test("a service that moved during the refresh keeps the snapshot's host with the snapshot's own token", async () => {
    const { service } = setup(async () => {
      throw new ConflictError({ message: AGENT_VAULT_SERVICE_MOVED_MESSAGE });
    });
    const { services } = await resolve(service);
    expect(services[0]).toMatchObject({
      hostPattern: "mcp.linear.app",
      credential: { type: "bearer", value: "snapshot-access", source: "oauth" }
    });
  });

  test("waits at most 4 seconds for a refresh, then sends the stored token", async () => {
    vi.useFakeTimers();
    try {
      const { service } = setup(() => new Promise(() => {}));
      let settled = false;
      const result = resolve(service).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(3_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const { services } = await result;
      expect(services[0].credential).toMatchObject({ value: "snapshot-access" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("a service that needs reauthorization isn't refreshed, even when its token is about to expire", async () => {
    const { service, refreshServiceToken } = setup(
      async () => refreshed,
      [
        serviceRow({
          credentialConfig: {
            status: AgentVaultOauthStatus.NeedsReauthorization,
            expiresAt: new Date(Date.now() + 10_000).toISOString()
          }
        })
      ]
    );
    const { services } = await resolve(service);
    expect(refreshServiceToken).not.toHaveBeenCalled();
    expect(services[0].credential).toMatchObject({ value: "snapshot-access" });
  });

  test("a variable reference inside an OAuth token is sent as is, while a Bearer token's is expanded", async () => {
    const variableId = "44444444-4444-4444-8444-444444444444";
    const reference = `{{${variableId}}}`;
    const { service } = setup(
      async () => refreshed,
      [
        serviceRow({
          credentialConfig: { status: AgentVaultOauthStatus.Connected, expiresAt: null },
          encryptedCredential: Buffer.from(JSON.stringify({ accessToken: `oauth-${reference}` }))
        }),
        serviceRow({
          id: "55555555-5555-4555-8555-555555555555",
          type: AgentVaultServiceType.Http,
          hostPattern: "api.example.com",
          config: null,
          credentialType: AgentVaultCredentialType.Bearer,
          credentialConfig: { headerName: "Authorization", headerPrefix: "Bearer" },
          encryptedCredential: Buffer.from(JSON.stringify({ value: `bearer-${reference}` }))
        })
      ],
      [{ id: variableId, encryptedValue: Buffer.from(JSON.stringify({ value: "expanded" })) }]
    );
    const { services } = await resolve(service);
    expect(services[0].credential).toMatchObject({ value: `oauth-${reference}` });
    expect(services[1].credential).toMatchObject({ value: "bearer-expanded" });
  });

  test("sends each service's allowed tools, and null for one that allows every tool", async () => {
    const { service } = setup(
      async () => refreshed,
      [
        serviceRow({ allowedTools: ["read_file", "search"] }),
        serviceRow({ id: "55555555-5555-4555-8555-555555555555", allowedTools: null })
      ]
    );
    const { services } = await resolve(service);
    expect(services.map((resolved) => resolved.allowedTools)).toEqual([["read_file", "search"], null]);
  });

  test("an OAuth token is always sent as Authorization: Bearer, whatever its config holds", async () => {
    const { service } = setup(
      async () => refreshed,
      [
        serviceRow({
          credentialConfig: {
            headerName: "X-Api-Key",
            headerPrefix: "Token",
            status: AgentVaultOauthStatus.Connected,
            expiresAt: null
          }
        })
      ]
    );
    const { services } = await resolve(service);
    expect(services[0].credential).toEqual({
      type: "bearer",
      headerName: "Authorization",
      headerPrefix: "Bearer",
      value: "snapshot-access",
      source: "oauth",
      expiresAt: null
    });
  });
});

describe("the services list a session's agent reads", () => {
  const noRefresh = async () => {
    throw new Error("listing services never refreshes a token");
  };

  test("describes the services, and the proxy that asked when it is in the session's project", async () => {
    const { service, createCipherPairWithDataKey } = setup(noRefresh, [serviceRow({ description: "Issues" })], [], {
      label: "nightly triage"
    });
    const listed = await service.getSessionServices({
      sessionToken: "token",
      proxyId: "proxy-1",
      proxyVersion: "0.44.0"
    });

    expect(listed.agentVault).toEqual({ proxy: "prod-proxy", version: "0.44.0", trafficPolicy: "service-hosts" });
    expect(listed.session).toEqual({ expiresAt: null, accessBundle: "bundle" });
    expect(listed.services).toMatchObject([
      {
        name: "linear",
        description: "Issues",
        type: "mcp",
        url: SERVER_URL,
        transport: "streamable-http",
        credential: { type: "oauth", header: "Authorization", addedByProxy: true, memberProvided: false }
      }
    ]);
    // Nothing in the list is ever sealed, so building it never derives a key.
    expect(createCipherPairWithDataKey).not.toHaveBeenCalled();
  });

  test("leaves the proxy out when it belongs to another project, or none named itself", async () => {
    const elsewhere = setup(noRefresh, [serviceRow()], [], {
      proxy: { projectId: "other-project", orgId: "org-1", pollInterval: 60, name: "theirs", trafficPolicy: "any-host" }
    });
    const named = await elsewhere.service.getSessionServices({ sessionToken: "token", proxyId: "proxy-2" });
    expect(named.agentVault).toEqual({ proxy: null, version: null, trafficPolicy: null });

    const direct = await setup(noRefresh, [serviceRow()]).service.getSessionServices({ sessionToken: "token" });
    expect(direct.agentVault).toEqual({ proxy: null, version: null, trafficPolicy: null });
  });

  test("names the exception hosts of a service-hosts proxy that asked", async () => {
    const { service } = setup(noRefresh, [serviceRow()], [], {
      proxy: {
        projectId: PROJECT_ID,
        orgId: "org-1",
        pollInterval: 60,
        name: "prod-proxy",
        trafficPolicy: "service-hosts",
        allowedHosts: "pypi.org,files.pythonhosted.org"
      }
    });
    const listed = await service.getSessionServices({ sessionToken: "token", proxyId: "proxy-1" });
    expect(listed.notes).toContain(
      "This proxy refuses requests to hosts no service covers, except these, which an admin allowed: pypi.org, files.pythonhosted.org. The proxy adds no credential to requests to them."
    );
  });

  test("lists inline services only while the session's owner is an admin", async () => {
    const owner = setup(noRefresh, [], [], { isOwnerAdmin: false });
    await owner.service.getSessionServices({ sessionToken: "token" });
    expect(owner.findInlineServices).not.toHaveBeenCalled();
  });

  test("names the session's bundle even when the bundle holds no services", async () => {
    const listed = await setup(noRefresh, []).service.getSessionServices({ sessionToken: "token" });
    expect(listed.session.accessBundle).toBe("bundle");
    expect(listed.services).toEqual([]);
  });

  test("reads everything for a session only the primary has from the primary", async () => {
    const fresh = setup(noRefresh, [serviceRow()], [], { onlyOnPrimary: true });
    const listed = await fresh.service.getSessionServices({ sessionToken: "token" });
    expect(listed.services).toHaveLength(1);
    expect(fresh.findResolvableServices).toHaveBeenCalledWith(expect.objectContaining({ onPrimary: true }));
    expect(fresh.findReachableBundles).toHaveBeenCalledWith(expect.objectContaining({ onPrimary: true }));
    expect(fresh.findInlineServices).toHaveBeenCalledWith("session-1", { onPrimary: true });

    const settled = setup(noRefresh, [serviceRow()]);
    await settled.service.getSessionServices({ sessionToken: "token" });
    expect(settled.findResolvableServices).toHaveBeenCalledWith(expect.objectContaining({ onPrimary: false }));
    expect(settled.findInlineServices).toHaveBeenCalledWith("session-1", { onPrimary: false });
  });

  test("resolve also reads a session only the primary has from the primary", async () => {
    const fresh = setup(noRefresh, [serviceRow()], [], { onlyOnPrimary: true });
    await fresh.service.resolveSession({
      proxyId: "proxy-1",
      orgId: "org-1",
      sessionToken: "token",
      hasSessionLogKey: false
    });
    expect(fresh.findResolvableServices).toHaveBeenCalledWith(expect.objectContaining({ onPrimary: true }));
    expect(fresh.findInlineServices).toHaveBeenCalledWith("session-1", { onPrimary: true });
  });
});

describe("resolve for a session on a user's behalf", () => {
  const USER_ID = "user-1";
  const IDENTITY_ID = "identity-1";
  type TActorSetup = {
    isAdmin?: boolean;
    grants?: string[];
    isActive?: boolean;
    canRead?: boolean;
    isMember?: boolean;
  };

  // Each actor gets its own org status, role and bundle grants, and resolve's reach is read off the bundles it asks for.
  const setupOnBehalfOf = ({
    user = {},
    identity = {},
    delegationCoversUser = true,
    isUserDeleted = false,
    rows = []
  }: {
    user?: TActorSetup;
    identity?: TActorSetup;
    delegationCoversUser?: boolean;
    isUserDeleted?: boolean;
    rows?: TResolveServiceRow[];
  }) => {
    const actor = (actorId: string) => (actorId === IDENTITY_ID ? identity : user);
    const findResolvableServices = vi.fn(async () => rows);
    const findPersonalValues = vi.fn(async () => []);
    const service = agentVaultProxyServiceFactory({
      agentVaultProxyDAL: {
        findByIdWithOrg: async () => ({ projectId: PROJECT_ID, orgId: "org-1", pollInterval: 60 })
      } as never,
      agentVaultResolveDAL: {
        findResolvableServices,
        findSessionSkills: async () => [],
        findReachableBundles: async () => [],
        findHooks: async () => [],
        findSessionMetadata: async () => ({})
      },
      agentVaultServiceCustomHeaderDAL: { findByServiceIds: async () => [] },
      agentVaultServiceSubstitutionDAL: { findByServiceIds: async () => [] },
      agentVaultVariableDAL: { findValuesForResolve: async () => [], findOauthForResolve: async () => [] },
      agentVaultPersonalValueDAL: { findForResolve: findPersonalValues },
      agentVaultSessionDAL: {
        findByTokenHash: async () =>
          ({
            id: "session-1",
            projectId: PROJECT_ID,
            userId: null,
            identityId: IDENTITY_ID,
            onBehalfOfUserId: isUserDeleted ? null : USER_ID,
            onBehalfOfUserName: "Alice Nguyen",
            revokedAt: null,
            expiresAt: null
          }) as never
      } as never,
      agentVaultSessionInlineServiceDAL: { findBySessionId: async () => [], deleteSecretsBySessionId: async () => {} },
      agentVaultSessionInlineSkillDAL: {
        findWithFilesBySessionId: async () => [],
        deleteFilesBySessionId: async () => {}
      },
      agentVaultDelegationDAL: { identityCoversUser: async () => delegationCoversUser },
      agentVaultSessionLogConfigDAL: {
        findOne: async () => sessionLogConfig,
        findByProjectIdFromPrimary: async () => sessionLogConfig
      },
      membershipDAL: {
        findResourceMembershipsForActor: async ({ actorId }: { actorId: string }) =>
          (actor(actorId).grants ?? []).map((scopeResourceId) => ({
            isActive: true,
            actorGroupId: null,
            scopeResourceId
          }))
      } as never,
      orgDAL: {
        findEffectiveOrgMembership: async ({ actorId }: { actorId: string }) =>
          ({ isActive: actor(actorId).isActive ?? true }) as never
      },
      permissionService: {
        getProjectPermission: async ({ actorId }: { actorId: string }) => {
          if (actor(actorId).isMember === false) {
            throw new ForbiddenRequestError({
              name: "ProjectMembershipNotFound",
              message: "Not a member of the project"
            });
          }
          const roleRules = actor(actorId).isAdmin
            ? agentVaultProjectAdminPermissions
            : agentVaultProjectMemberPermissions;
          return {
            permission: createMongoAbility(actor(actorId).canRead === false ? [] : roleRules),
            hasRole: () => Boolean(actor(actorId).isAdmin),
            memberships: []
          } as never;
        }
      },
      kmsDataKeyService: {
        createCipherPairWithDataKey: async () =>
          ({ decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob }) as never
      } as never,
      licenseService: new FakeLicenseService(),
      agentVaultAccessService: agentVaultAccess(),
      resourceAuthMethodService: {} as never,
      agentVaultOauthService: {
        refreshServiceToken: vi.fn() as never,
        reportMissingScopes: vi.fn() as never
      },
      projectDAL: { findById: async () => ({ id: PROJECT_ID, orgId: "org-1" }) as never },
      userDAL: { findById: async () => undefined as never }
    });
    const resolve = () =>
      service.resolveSession({ proxyId: "proxy-1", orgId: "org-1", sessionToken: "token", hasSessionLogKey: false });
    const reachedBundles = () =>
      (findResolvableServices.mock.calls[0] as unknown as [{ accessBundleIds: string[] | null }])[0].accessBundleIds;
    return { service, resolve, reachedBundles, findPersonalValues };
  };

  test("the services list names the user the session is for, whose personal values it uses", async () => {
    const memberRow = serviceRow({
      type: AgentVaultServiceType.Http,
      name: "github",
      hostPattern: "api.github.com",
      config: {},
      credentialType: AgentVaultCredentialType.Bearer,
      credentialConfig: { headerName: "Authorization", headerPrefix: "Bearer " },
      encryptedCredential: null,
      memberProvidedFields: ["credential-value"]
    });
    const { service, findPersonalValues } = setupOnBehalfOf({ rows: [memberRow] });
    findPersonalValues.mockResolvedValue([
      { serviceId: SERVICE_ID, field: "credential-value", encryptedValue: Buffer.from("sealed"), oauthConfig: null }
    ] as never);
    const listed = await service.getSessionServices({ sessionToken: "token" });
    expect(findPersonalValues).toHaveBeenCalledWith(expect.objectContaining({ owner: { userId: USER_ID } }));
    expect(listed.services[0]).toMatchObject({
      status: "ready",
      credential: { type: "bearer", addedByProxy: true, memberProvided: true }
    });
    expect(listed.services[0].howToUse).toContain(
      "If the service rejects it with 401 or 403, that user has to update their personal value"
    );
    expect(listed.notes.some((note) => note.includes("or the user this session is for when"))).toBe(true);
  });

  test("a non-admin user's reach is narrowed to the bundles the identity reaches too", async () => {
    const { resolve, reachedBundles } = setupOnBehalfOf({
      user: { grants: ["bundle-a", "bundle-b"] },
      identity: { grants: ["bundle-b", "bundle-c"] }
    });
    await resolve();
    expect(reachedBundles()).toEqual(["bundle-b"]);
  });

  test("an admin on either side leaves the other side's reach", async () => {
    const adminIdentity = setupOnBehalfOf({ user: { grants: ["bundle-a"] }, identity: { isAdmin: true } });
    await adminIdentity.resolve();
    expect(adminIdentity.reachedBundles()).toEqual(["bundle-a"]);

    const adminUser = setupOnBehalfOf({ user: { isAdmin: true }, identity: { grants: ["bundle-c"] } });
    await adminUser.resolve();
    expect(adminUser.reachedBundles()).toEqual(["bundle-c"]);
  });

  test("a delegation that no longer covers the user is a 401", async () => {
    const { resolve } = setupOnBehalfOf({ user: { grants: ["bundle-a"] }, delegationCoversUser: false });
    await expect(resolve()).rejects.toThrow(UnauthorizedError);
  });

  test("an identity deactivated in the org is a 401", async () => {
    const { resolve } = setupOnBehalfOf({ user: { grants: ["bundle-a"] }, identity: { isActive: false } });
    await expect(resolve()).rejects.toThrow(UnauthorizedError);
  });

  test("a user deactivated in the org is a 401", async () => {
    const { resolve } = setupOnBehalfOf({ user: { grants: ["bundle-a"], isActive: false } });
    await expect(resolve()).rejects.toThrow(UnauthorizedError);
  });

  // The name is left behind, so the session must not fall back to resolving as the identity's own.
  test("a session whose user was deleted is a 401, not the identity's own session", async () => {
    const { resolve } = setupOnBehalfOf({ identity: { isAdmin: true }, isUserDeleted: true });
    await expect(resolve()).rejects.toThrow(UnauthorizedError);
  });

  test("a user without Read on sessions is a 401", async () => {
    const { resolve } = setupOnBehalfOf({ user: { grants: ["bundle-a"], canRead: false } });
    await expect(resolve()).rejects.toThrow(UnauthorizedError);
  });

  // A 403 reads to the proxy as "Infisical is unreachable", which would keep the agent running through its grace window.
  test("a user no longer in Agent Vault is a 401, not a 403", async () => {
    const { resolve } = setupOnBehalfOf({ user: { isMember: false } });
    await expect(resolve()).rejects.toThrow(UnauthorizedError);
  });

  test("personal values are looked up for the user, never the identity", async () => {
    const { resolve, findPersonalValues } = setupOnBehalfOf({
      user: { isAdmin: true },
      identity: { isAdmin: true },
      rows: [
        serviceRow({
          type: AgentVaultServiceType.Http,
          hostPattern: "api.example.com",
          credentialType: AgentVaultCredentialType.Bearer,
          credentialConfig: { headerName: "Authorization", headerPrefix: "Bearer" },
          encryptedCredential: Buffer.from(JSON.stringify({ value: "" })),
          memberProvidedFields: ["credential-value"]
        })
      ]
    });
    await resolve();
    expect(findPersonalValues).toHaveBeenCalledWith({ serviceIds: [SERVICE_ID], owner: { userId: USER_ID } });
  });
});

describe("resolve with inline services", () => {
  const resolve = (service: ReturnType<typeof setup>["service"]) =>
    service.resolveSession({ proxyId: "proxy-1", orgId: "org-1", sessionToken: "token", hasSessionLogKey: false });
  const noRefresh = async () => {
    throw new Error("nothing here needs a refresh");
  };

  const passthroughBundleRow = serviceRow({
    name: "bundle-api",
    type: AgentVaultServiceType.Http,
    hostPattern: "api.example.com",
    config: {},
    credentialType: AgentVaultCredentialType.Passthrough,
    credentialConfig: {},
    encryptedCredential: null
  });

  const inlineRow = (
    overrides: Partial<TAgentVaultInlineServiceSecretsRow> = {}
  ): TAgentVaultInlineServiceSecretsRow => ({
    id: "inline-1",
    projectId: PROJECT_ID,
    sessionId: "session-1",
    position: 0,
    name: "inline-api",
    description: null,
    type: AgentVaultServiceType.Http,
    config: {},
    hostPattern: "api.example.com",
    allowedMethods: null,
    allowedPathPrefixes: null,
    credentialType: AgentVaultCredentialType.Bearer,
    credentialConfig: { type: AgentVaultCredentialType.Bearer, headerName: "Authorization", headerPrefix: "Bearer" },
    allowedTools: null,
    memberProvidedFields: null,
    customHeaders: [],
    substitutions: [],
    // The test's decryptor hands the sealed bytes back as they are.
    encryptedCredential: Buffer.from(JSON.stringify({ value: "inline-token" })),
    secretsDeletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  // The proxy picks the first of two equally specific matches, so the bundle's service wins a host both cover.
  test("sends the inline services after the access bundle's", async () => {
    const { service } = setup(noRefresh, [passthroughBundleRow], [], { inlineRows: [inlineRow()] });
    const { services } = await resolve(service);
    expect(services.map((resolved) => resolved.name)).toEqual(["bundle-api", "inline-api"]);
    expect(services[1]).toMatchObject({ accessBundleName: null, credential: { value: "inline-token" } });
  });

  test("leaves the inline services out once the session's owner isn't an admin", async () => {
    const { service, findInlineServices } = setup(noRefresh, [passthroughBundleRow], [], {
      inlineRows: [inlineRow()],
      isOwnerAdmin: false
    });
    const { services } = await resolve(service);
    expect(services.map((resolved) => resolved.name)).toEqual(["bundle-api"]);
    expect(findInlineServices).not.toHaveBeenCalled();
  });

  test("derives the data key only when an inline service has something sealed", async () => {
    const unsealed = setup(noRefresh, [passthroughBundleRow], [], {
      inlineRows: [
        inlineRow({
          credentialType: AgentVaultCredentialType.Passthrough,
          credentialConfig: { type: AgentVaultCredentialType.Passthrough },
          encryptedCredential: null
        })
      ]
    });
    expect((await resolve(unsealed.service)).services).toHaveLength(2);
    expect(unsealed.createCipherPairWithDataKey).not.toHaveBeenCalled();

    const sealed = setup(noRefresh, [passthroughBundleRow], [], { inlineRows: [inlineRow()] });
    await resolve(sealed.service);
    expect(sealed.createCipherPairWithDataKey).toHaveBeenCalledTimes(1);
  });

  test("an inline service sent with a hook before hooks became their own resource keeps it, checking every request", async () => {
    const legacy = inlineRow({
      credentialType: AgentVaultCredentialType.Passthrough,
      credentialConfig: { type: AgentVaultCredentialType.Passthrough },
      encryptedCredential: null,
      hookUrl: "https://hooks.example.com/agent-vault",
      encryptedHookSecret: Buffer.from(JSON.stringify({ value: "s".repeat(32) }))
    });
    const { service, createCipherPairWithDataKey } = setup(noRefresh, [], [], { inlineRows: [legacy] });
    const { services } = await resolve(service);
    expect(services[0].hook).toEqual({
      id: "inline-1",
      name: "inline-api-hook",
      url: "https://hooks.example.com/agent-vault",
      secret: "s".repeat(32)
    });
    expect(createCipherPairWithDataKey).toHaveBeenCalledTimes(1);
  });

  test("an inline service sent with a saved hook goes out with it and its narrowing", async () => {
    const hooked = inlineRow({
      hookId: "77777777-7777-4777-8777-777777777777",
      hookTools: null,
      hookMethods: ["POST"]
    });
    const { service } = setup(noRefresh, [], [], {
      inlineRows: [hooked],
      hooks: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          name: "approvals",
          url: "https://hooks.example.com/agent-vault",
          encryptedSecret: Buffer.from(JSON.stringify({ value: "s".repeat(32) }))
        }
      ]
    });
    expect((await resolve(service)).services[0].hook).toMatchObject({ name: "approvals", methods: ["POST"] });
  });
});

describe("hooks on resolve", () => {
  const resolve = (service: ReturnType<typeof setup>["service"]) =>
    service.resolveSession({ proxyId: "proxy-1", orgId: "org-1", sessionToken: "token", hasSessionLogKey: false });
  const noRefresh = async () => {
    throw new Error("nothing here needs a refresh");
  };
  const hookedRow = serviceRow({
    name: "stripe",
    type: AgentVaultServiceType.Http,
    hostPattern: "api.stripe.com",
    config: {},
    credentialType: AgentVaultCredentialType.Passthrough,
    credentialConfig: {},
    encryptedCredential: null
  });
  const savedHook = {
    id: "77777777-7777-4777-8777-777777777777",
    name: "approvals",
    url: "https://hooks.example.com/agent-vault",
    // The test's decryptor hands the sealed bytes back as they are.
    encryptedSecret: Buffer.from(JSON.stringify({ value: "s".repeat(32) }))
  };
  const narrowedRow = { ...hookedRow, hookId: savedHook.id, hookMethods: ["POST"], hookPaths: ["/v1/refunds"] };
  const plainRow = serviceRow({
    id: "22222222-2222-4222-8222-222222222222",
    name: "github",
    type: AgentVaultServiceType.Http,
    hostPattern: "api.github.com",
    config: {},
    credentialType: AgentVaultCredentialType.Passthrough,
    credentialConfig: {},
    encryptedCredential: null
  });

  test("sends each service's hook with its secret and narrowing, and null for a service without one", async () => {
    const { service, createCipherPairWithDataKey, findHooks } = setup(noRefresh, [narrowedRow, plainRow], [], {
      hooks: [savedHook]
    });
    const resolved = await resolve(service);
    expect(findHooks).toHaveBeenCalledWith(expect.objectContaining({ hookIds: [savedHook.id], projectId: PROJECT_ID }));
    expect(resolved.services[0].hook).toEqual({
      id: savedHook.id,
      name: "approvals",
      url: "https://hooks.example.com/agent-vault",
      secret: "s".repeat(32),
      methods: ["POST"],
      paths: ["/v1/refunds"]
    });
    expect(resolved.services[1].hook).toBeNull();
    expect(resolved).not.toHaveProperty("hook");
    // Pass-through services and a hook: the hook's secret is still sealed.
    expect(createCipherPairWithDataKey).toHaveBeenCalledTimes(1);
  });

  test("a hook with no narrowing goes out without methods, paths or tools, so it checks every request", async () => {
    const { service } = setup(noRefresh, [{ ...hookedRow, hookId: savedHook.id }], [], { hooks: [savedHook] });
    const [resolved] = (await resolve(service)).services;
    expect(resolved.hook).toEqual({
      id: savedHook.id,
      name: "approvals",
      url: "https://hooks.example.com/agent-vault",
      secret: "s".repeat(32)
    });
  });

  test("a narrowing left behind without a hook is never sent", async () => {
    const { service } = setup(noRefresh, [{ ...hookedRow, hookId: null, hookMethods: ["POST"] }]);
    expect((await resolve(service)).services[0].hook).toBeNull();
  });

  test("a project service's old hook columns are never sent, since its hook moved to a saved hook", async () => {
    const withOldColumns = { ...hookedRow, hookUrl: "https://old.example.com", encryptedHookSecret: Buffer.from("x") };
    const { service } = setup(noRefresh, [withOldColumns]);
    expect((await resolve(service)).services[0].hook).toBeNull();
  });

  test("a hook not yet on the replica is read again from the primary, and one deleted goes out as none", async () => {
    const late = setup(noRefresh, [narrowedRow], [], { hooks: [savedHook], hooksOnlyOnPrimary: true });
    expect((await resolve(late.service)).services[0].hook).toMatchObject({ id: savedHook.id });
    expect(late.findHooks).toHaveBeenCalledTimes(2);
    expect(late.findHooks).toHaveBeenLastCalledWith(expect.objectContaining({ onPrimary: true }));

    const deleted = setup(noRefresh, [narrowedRow]);
    expect((await resolve(deleted.service)).services[0].hook).toBeNull();
  });

  test("a deleted hook on a session read from the primary is not read twice", async () => {
    const { service, findHooks } = setup(noRefresh, [narrowedRow], [], { onlyOnPrimary: true });
    expect((await resolve(service)).services[0].hook).toBeNull();
    expect(findHooks).toHaveBeenCalledTimes(1);
  });

  test("off-plan, a service's hook keeps going out", async () => {
    const { service } = setup(noRefresh, [narrowedRow], [], {
      hooks: [savedHook],
      licenseService: new FakeLicenseService().setPlan("org-1", { agentVaultHooks: false })
    });
    expect((await resolve(service)).services[0].hook).toMatchObject({ id: savedHook.id });
  });

  test("sends the session's metadata when a service has a hook", async () => {
    const { service } = setup(noRefresh, [narrowedRow], [], { hooks: [savedHook], metadata: { userRef: "u-42" } });
    expect((await resolve(service)).session.metadata).toEqual({ userRef: "u-42" });
  });

  test("a session without a hook sends empty metadata without reading it", async () => {
    const { service, findSessionMetadata } = setup(noRefresh, [hookedRow], [], { metadata: { userRef: "u-42" } });
    expect((await resolve(service)).session.metadata).toEqual({});
    expect(findSessionMetadata).not.toHaveBeenCalled();
  });

  test("the session names a machine identity actor when an older row has no actorType", async () => {
    const { service } = setup(noRefresh, [hookedRow], [], {
      label: "Nightly refunds",
      session: {
        userId: null,
        identityId: "identity-1",
        actorType: null,
        actorName: "support-agent",
        actorEmail: null
      }
    });
    const { session } = await resolve(service);
    expect(session).toEqual({
      label: "Nightly refunds",
      metadata: {},
      actor: { type: "machineIdentity", id: "identity-1", name: "support-agent", email: null },
      onBehalfOf: null
    });
  });

  test("the session names a user actor, and no one it acts for without a name", async () => {
    const { service } = setup(noRefresh, [hookedRow], [], {
      session: { actorType: null, actorName: "Ana Silva", actorEmail: "ana@acme.com", onBehalfOfUserId: "user-2" }
    });
    const { session } = await resolve(service);
    expect(session.actor).toEqual({ type: "user", id: "user-1", name: "Ana Silva", email: "ana@acme.com" });
    expect(session.onBehalfOf).toBeNull();
  });
});

describe("database and SSH services on resolve", () => {
  const resolve = (service: ReturnType<typeof setup>["service"]) =>
    service.resolveSession({ proxyId: "proxy-1", orgId: "org-1", sessionToken: "token", hasSessionLogKey: false });

  test("carry their server in native and no host pattern", async () => {
    const { service } = setup(
      async () => refreshed,
      [
        serviceRow({
          type: AgentVaultServiceType.Postgres,
          hostPattern: null,
          config: { host: "db.internal", port: 5432, database: "app", tls: { enabled: true, verify: false } },
          credentialType: AgentVaultCredentialType.Basic,
          credentialConfig: { type: AgentVaultCredentialType.Basic },
          encryptedCredential: Buffer.from(JSON.stringify({ username: "agent", password: "p" }))
        })
      ]
    );
    const { services } = await resolve(service);
    expect(services[0]).toMatchObject({
      hostPattern: null,
      native: { host: "db.internal", port: 5432, database: "app", tls: { enabled: true, verify: false, ca: null } },
      credential: { type: AgentVaultCredentialType.Basic, username: "agent", password: "p" }
    });
  });

  test("send an SSH key with its certificate, and HTTP and MCP services send no native target", async () => {
    const { service } = setup(
      async () => refreshed,
      [
        serviceRow({
          type: AgentVaultServiceType.Ssh,
          hostPattern: null,
          config: { host: "bastion.internal", port: 22 },
          credentialType: AgentVaultCredentialType.SshKey,
          credentialConfig: { type: AgentVaultCredentialType.SshKey, hasCertificate: true },
          encryptedCredential: Buffer.from(
            JSON.stringify({ username: "agent", privateKey: "key", certificate: "cert" })
          )
        }),
        serviceRow({ id: "55555555-5555-4555-8555-555555555555" })
      ]
    );
    const { services } = await resolve(service);
    expect(services[0].credential).toEqual({
      type: AgentVaultCredentialType.SshKey,
      username: "agent",
      privateKey: "key",
      certificate: "cert"
    });
    expect(services[1].native).toBeNull();
  });
});

describe("a proxy heartbeat", () => {
  test("is recorded for the token version the request was authenticated with", async () => {
    const { service, recordHeartbeat } = setup(async () => refreshed);
    await expect(service.heartbeat({ proxyId: "proxy-1", tokenVersion: 1 })).resolves.toHaveProperty("config");
    expect(recordHeartbeat).toHaveBeenCalledWith("proxy-1", 1);
  });

  test("whose token was revoked after the auth check is a 401", async () => {
    const { service } = setup(async () => refreshed);
    await expect(service.heartbeat({ proxyId: "proxy-1", tokenVersion: 0 })).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("proxy CA fingerprints for a session", () => {
  test("lists the fingerprints of the proxies in the session's project", async () => {
    const { service, findCaFingerprintsByProjectId, findSessionOnPrimary } = setup(async () => refreshed);
    await expect(service.getSessionProxyCaFingerprints({ sessionToken: "token" })).resolves.toEqual({
      fingerprints: ["SHA256:AA:BB"]
    });
    expect(findCaFingerprintsByProjectId).toHaveBeenCalledWith(PROJECT_ID);
    // A connect straight after the mint would otherwise miss the session on a replica.
    expect(findSessionOnPrimary).toHaveBeenCalled();
  });

  test("a revoked session's token is a 401", async () => {
    const { service, findCaFingerprintsByProjectId } = setup(async () => refreshed, [serviceRow()], [], {
      revokedAt: new Date()
    });
    await expect(service.getSessionProxyCaFingerprints({ sessionToken: "token" })).rejects.toBeInstanceOf(
      UnauthorizedError
    );
    expect(findCaFingerprintsByProjectId).not.toHaveBeenCalled();
  });
});

describe("resolve for a service whose members sign in", () => {
  const resolve = (service: ReturnType<typeof setup>["service"]) =>
    service.resolveSession({ proxyId: "proxy-1", orgId: "org-1", sessionToken: "token", hasSessionLogKey: false });

  // Its sealed half is the admin-entered client's secret, which must never go out as a token.
  const memberRow = serviceRow({
    credentialConfig: {
      type: "oauth",
      serverUrl: SERVER_URL,
      issuer: "https://mcp.linear.app",
      registration: "manual"
    },
    encryptedCredential: Buffer.from(JSON.stringify({ clientSecret: "client-secret" })),
    memberProvidedFields: ["credential-value"]
  });
  const connection = (oauthConfig: Record<string, unknown>) => ({
    serviceId: SERVICE_ID,
    field: "credential-value",
    encryptedValue: Buffer.from(JSON.stringify({ accessToken: "member-access" })),
    oauthConfig: { serverUrl: SERVER_URL, ...oauthConfig }
  });

  test("sends the session owner's own token, marked as member provided", async () => {
    const { service, refreshServiceToken } = setup(async () => refreshed, [memberRow], [], {
      personalRows: [connection({ status: AgentVaultOauthStatus.Connected, expiresAt: null })]
    });
    const { services } = await resolve(service);
    expect(services[0]).toMatchObject({
      personalValuesMissing: false,
      memberProvided: true,
      credential: { type: "bearer", value: "member-access", source: "oauth" }
    });
    expect(refreshServiceToken).not.toHaveBeenCalled();
  });

  test("refreshes the owner's token when it is about to expire, never the service's", async () => {
    const { service, refreshServiceToken } = setup(async () => refreshed, [memberRow], [], {
      personalRows: [
        connection({ status: AgentVaultOauthStatus.Connected, expiresAt: new Date(Date.now() + 10_000).toISOString() })
      ]
    });
    const { services } = await resolve(service);
    expect(refreshServiceToken.mock.calls[0][0].owner).toEqual({ userId: "user-1" });
    expect(services[0]).toMatchObject({ credential: { value: "refreshed-access" } });
  });

  test("an owner who hasn't connected, or whose login died, gets the refusal and no credential", async () => {
    const notConnected = setup(async () => refreshed, [memberRow]);
    const dead = setup(async () => refreshed, [memberRow], [], {
      personalRows: [connection({ status: AgentVaultOauthStatus.NeedsReauthorization, expiresAt: null })]
    });
    for (const { service } of [notConnected, dead]) {
      // eslint-disable-next-line no-await-in-loop
      const { services } = await resolve(service);
      expect(services[0]).toMatchObject({
        personalValuesMissing: true,
        memberProvided: true,
        credential: { type: "passthrough" }
      });
    }
  });

  test("a token authorized for another server is refused, not sent to this one", async () => {
    const { service } = setup(async () => refreshed, [memberRow], [], {
      personalRows: [
        connection({
          serverUrl: "https://old.example.com/mcp",
          status: AgentVaultOauthStatus.Connected,
          expiresAt: null
        })
      ]
    });
    const { services } = await resolve(service);
    expect(services[0]).toMatchObject({ personalValuesMissing: true, credential: { type: "passthrough" } });
  });

  test("the services list waits for the owner exactly when resolve refuses their sign-in", async () => {
    // Registered dynamically, so the row seals nothing that could pass for a credential.
    const dynamicRow = { ...memberRow, encryptedCredential: null };
    const cases = [
      { personalRows: [connection({ status: AgentVaultOauthStatus.Connected, expiresAt: null })], ready: true },
      { personalRows: [], ready: false },
      {
        personalRows: [connection({ status: AgentVaultOauthStatus.NeedsReauthorization, expiresAt: null })],
        ready: false
      },
      {
        personalRows: [
          connection({
            serverUrl: "https://old.example.com/mcp",
            status: AgentVaultOauthStatus.Connected,
            expiresAt: null
          })
        ],
        ready: false
      }
    ];
    for (const { personalRows, ready } of cases) {
      const { service } = setup(async () => refreshed, [dynamicRow], [], { personalRows });
      // eslint-disable-next-line no-await-in-loop
      const [listed] = (await service.getSessionServices({ sessionToken: "token" })).services;
      // eslint-disable-next-line no-await-in-loop
      const [resolved] = (await resolve(service)).services;
      expect(resolved.personalValuesMissing).toBe(!ready);
      expect(listed).toMatchObject(
        ready
          ? {
              status: "ready",
              credential: { type: "oauth", header: "Authorization", addedByProxy: true, memberProvided: true }
            }
          : {
              status: "needs-personal-values",
              credential: { type: "none", addedByProxy: false, memberProvided: true }
            }
      );
    }
  });

  test("a refresh after a rejection names the session's owner", async () => {
    const { service, refreshServiceToken } = setup(async () => refreshed, [memberRow]);
    await service.refreshCredential({ ...refreshArgs, hostPattern: "mcp.linear.app" });
    expect(refreshServiceToken.mock.calls[0][0].owner).toEqual({ userId: "user-1" });
  });
});

describe("OAuth variables on resolve", () => {
  const VARIABLE_ID = "77777777-7777-4777-8777-777777777777";
  const resolve = (service: ReturnType<typeof setup>["service"]) =>
    service.resolveSession({ proxyId: "proxy-1", orgId: "org-1", sessionToken: "token", hasSessionLogKey: false });
  const noRefresh = async () => {
    throw new Error("nothing here needs a refresh");
  };
  const variableConfig = { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: VARIABLE_ID };

  const oauthVariable = ({ expiresAt = null as string | null, connected = true } = {}) => ({
    id: VARIABLE_ID,
    key: "GDRIVE_U123",
    // The test's decryptor hands the sealed bytes back as they are.
    encryptedValue: connected ? Buffer.from(JSON.stringify({ accessToken: "variable-access" })) : null,
    oauthConfig: {
      settings: {},
      connection: connected ? { status: AgentVaultOauthStatus.Connected, expiresAt } : null
    }
  });

  const variableService = (overrides: Partial<TResolveServiceRow> = {}) =>
    serviceRow({
      name: "gdrive",
      type: AgentVaultServiceType.Http,
      hostPattern: "www.googleapis.com",
      config: {},
      credentialConfig: variableConfig,
      encryptedCredential: null,
      ...overrides
    });

  const inlineOauthRow = (
    overrides: Partial<TAgentVaultInlineServiceSecretsRow> = {}
  ): TAgentVaultInlineServiceSecretsRow => ({
    id: "inline-1",
    projectId: PROJECT_ID,
    sessionId: "session-1",
    position: 0,
    name: "inline-gdrive",
    description: null,
    type: AgentVaultServiceType.Http,
    config: {},
    hostPattern: "www.googleapis.com",
    allowedMethods: null,
    allowedPathPrefixes: null,
    credentialType: AgentVaultCredentialType.OAuth,
    credentialConfig: variableConfig,
    allowedTools: null,
    memberProvidedFields: null,
    customHeaders: [],
    substitutions: [],
    encryptedCredential: null,
    secretsDeletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  });

  test("a session whose only service uses an OAuth variable sends the variable's token", async () => {
    const { service, createCipherPairWithDataKey } = setup(noRefresh, [variableService()], [], {
      oauthVariables: [oauthVariable()]
    });

    const { services } = await resolve(service);

    expect(services[0]).toMatchObject({
      credential: { type: AgentVaultCredentialType.Bearer, value: "variable-access", source: "oauth" },
      personalValuesMissing: false
    });
    expect(services[0].credentialRemoved).toBeUndefined();
    expect(createCipherPairWithDataKey).toHaveBeenCalledTimes(1);
  });

  test("two services on one variable refresh it once, and both send the new token", async () => {
    const { service, refreshServiceToken } = setup(
      async () => refreshed,
      [variableService(), variableService({ id: "service-2", name: "gmail", hostPattern: "gmail.googleapis.com" })],
      [],
      { oauthVariables: [oauthVariable({ expiresAt: new Date(Date.now() + 10_000).toISOString() })] }
    );

    const { services } = await resolve(service);

    expect(refreshServiceToken).toHaveBeenCalledTimes(1);
    expect(refreshServiceToken.mock.calls[0][0]).toMatchObject({
      serviceId: SERVICE_ID,
      variableId: VARIABLE_ID,
      destination: { hostPattern: "www.googleapis.com", serverUrl: null }
    });
    expect(services.map((resolved) => (resolved.credential as { value: string }).value)).toEqual([
      "refreshed-access",
      "refreshed-access"
    ]);
  });

  test("a refresh through a service that moved meanwhile goes through the next service using the variable", async () => {
    let calls = 0;
    const { service, refreshServiceToken } = setup(
      async () => {
        calls += 1;
        if (calls === 1) throw new ConflictError({ message: AGENT_VAULT_SERVICE_MOVED_MESSAGE });
        return refreshed;
      },
      [variableService(), variableService({ id: "service-2", name: "gmail", hostPattern: "gmail.googleapis.com" })],
      [],
      { oauthVariables: [oauthVariable({ expiresAt: new Date(Date.now() + 10_000).toISOString() })] }
    );

    const { services } = await resolve(service);

    expect(refreshServiceToken.mock.calls.map(([dto]) => dto.serviceId)).toEqual([SERVICE_ID, "service-2"]);
    expect((services[1].credential as { value: string }).value).toBe("refreshed-access");
    // The moved service's snapshot still names its old host, so it keeps the token it had until the next poll.
    const moved = services[0].credential as { value?: string };
    expect(moved.value).toBeDefined();
    expect(moved.value).not.toBe("refreshed-access");
  });

  test("a variable that isn't connected is flagged by name, and as missing values for older proxies", async () => {
    const { service } = setup(noRefresh, [variableService()], [], {
      oauthVariables: [oauthVariable({ connected: false })]
    });

    const { services } = await resolve(service);

    expect(services[0]).toMatchObject({
      credential: { type: AgentVaultCredentialType.Passthrough },
      personalValuesMissing: true,
      credentialNotConnected: true
    });
    expect(services[0].credentialRemoved).toBeUndefined();
  });

  test("a session's own service whose variable isn't connected is flagged, but not as removed", async () => {
    const { service } = setup(noRefresh, [], [], {
      inlineRows: [inlineOauthRow()],
      oauthVariables: [oauthVariable({ connected: false })]
    });

    const { services } = await resolve(service);

    expect(services[0]).toMatchObject({
      credential: { type: AgentVaultCredentialType.Passthrough },
      personalValuesMissing: true,
      credentialNotConnected: true
    });
    expect(services[0].credentialRemoved).toBeUndefined();
  });

  test("the services list says a service whose variable isn't connected is not ready, bundle and session alike", async () => {
    const { service } = setup(noRefresh, [variableService()], [], {
      inlineRows: [inlineOauthRow()],
      oauthVariables: [oauthVariable({ connected: false })]
    });

    const listed = await service.getSessionServices({ sessionToken: "token" });

    expect(listed.services.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: "gdrive", status: "needs-personal-values" },
      { name: "inline-gdrive", status: "needs-personal-values" }
    ]);
    expect(listed.services[0].howToUse).toMatch(/isn't connected in Agent Vault/);
  });

  test("the services list says a service whose variable is signed in is ready", async () => {
    const { service } = setup(noRefresh, [variableService()], [], { oauthVariables: [oauthVariable()] });

    const listed = await service.getSessionServices({ sessionToken: "token" });

    expect(listed.services[0]).toMatchObject({ status: "ready", credential: { type: "oauth" } });
  });

  test("a session's own service sends the variable's token", async () => {
    const { service } = setup(noRefresh, [], [], {
      inlineRows: [inlineOauthRow()],
      oauthVariables: [oauthVariable()]
    });

    const { services } = await resolve(service);

    expect(services[0]).toMatchObject({
      name: "inline-gdrive",
      credential: { type: AgentVaultCredentialType.Bearer, value: "variable-access", source: "oauth" },
      personalValuesMissing: false
    });
  });

  test("a session's own service whose variable was deleted is flagged, so every proxy refuses it", async () => {
    const { service } = setup(noRefresh, [], [], { inlineRows: [inlineOauthRow()] });

    const { services } = await resolve(service);

    expect(services[0]).toMatchObject({
      credential: { type: AgentVaultCredentialType.Passthrough },
      personalValuesMissing: true,
      credentialRemoved: true
    });
    expect(services[0].credentialNotConnected).toBeUndefined();
  });

  test("tokens sent with the session go out, refreshed in place when they are about to expire", async () => {
    const tokens = inlineOauthRow({
      credentialConfig: {
        type: AgentVaultCredentialType.OAuth,
        status: AgentVaultOauthStatus.Connected,
        expiresAt: new Date(Date.now() + 10_000).toISOString()
      },
      encryptedCredential: Buffer.from(JSON.stringify({ accessToken: "inline-access", refreshToken: "inline-refresh" }))
    });
    const { service, refreshServiceToken } = setup(async () => refreshed, [], [], { inlineRows: [tokens] });

    const { services } = await resolve(service);

    expect(refreshServiceToken.mock.calls[0][0]).toMatchObject({ serviceId: "inline-1", inline: true });
    expect((services[0].credential as { value: string }).value).toBe("refreshed-access");
  });

  test("tokens sent with the session go out as they are when they aren't about to expire", async () => {
    const tokens = inlineOauthRow({
      credentialConfig: { type: AgentVaultCredentialType.OAuth, status: AgentVaultOauthStatus.Connected },
      encryptedCredential: Buffer.from(JSON.stringify({ accessToken: "inline-access" }))
    });
    const { service } = setup(noRefresh, [], [], { inlineRows: [tokens] });

    const { services } = await resolve(service);

    expect(services[0].credential).toMatchObject({ value: "inline-access", source: "oauth" });
  });

  test("a refresh after a rejection reaches the variable, or the tokens sent with the session", async () => {
    const bundle = setup(async () => refreshed, [variableService()]);
    await bundle.service.refreshCredential({ ...refreshArgs, hostPattern: "www.googleapis.com" });
    expect(bundle.refreshServiceToken.mock.calls[0][0]).toMatchObject({ variableId: VARIABLE_ID });

    const tokens = inlineOauthRow({
      credentialConfig: { type: AgentVaultCredentialType.OAuth, status: AgentVaultOauthStatus.Connected },
      encryptedCredential: Buffer.from(JSON.stringify({ accessToken: "inline-access" }))
    });
    const inline = setup(async () => refreshed, [], [], { inlineRows: [tokens] });
    await inline.service.refreshCredential({
      ...refreshArgs,
      serviceId: "inline-1",
      hostPattern: "www.googleapis.com"
    });
    expect(inline.refreshServiceToken.mock.calls[0][0]).toMatchObject({ serviceId: "inline-1", inline: true });

    await inline.service.reportMissingScopes({
      ...refreshArgs,
      serviceId: "inline-1",
      hostPattern: "www.googleapis.com",
      requiredScopes: ["drive"]
    });
    expect(inline.reportMissingScopes).toHaveBeenCalledWith(expect.objectContaining({ inline: true }));
  });

  test("a session's own service is not found for a refresh once its owner can't send them", async () => {
    const { service } = setup(async () => refreshed, [], [], {
      inlineRows: [inlineOauthRow()],
      isOwnerAdmin: false
    });
    await expect(
      service.refreshCredential({ ...refreshArgs, serviceId: "inline-1", hostPattern: "www.googleapis.com" })
    ).rejects.toThrow(NotFoundError);
  });
});
