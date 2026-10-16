import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ConflictError } from "@app/lib/errors";

import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultServiceType
} from "../agent-vault/agent-vault-enums";
import { AGENT_VAULT_SERVICE_MOVED_MESSAGE } from "../agent-vault-oauth/agent-vault-oauth-service";
import { TRefreshServiceTokenDTO } from "../agent-vault-oauth/agent-vault-oauth-types";
import { agentVaultProxyServiceFactory } from "./agent-vault-proxy-service";
import { TResolveServiceRow } from "./agent-vault-resolve-dal";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SERVICE_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_URL = "https://mcp.linear.app/mcp";

const serviceRow = (overrides: Partial<TResolveServiceRow> = {}): TResolveServiceRow => ({
  id: SERVICE_ID,
  name: "linear",
  accessBundleId: "22222222-2222-4222-8222-222222222222",
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
  position: 0,
  ...overrides
});

const setup = (refresh: (dto: TRefreshServiceTokenDTO) => Promise<unknown>, rows = [serviceRow()]) => {
  const refreshServiceToken = vi.fn(refresh);
  const service = agentVaultProxyServiceFactory({
    agentVaultProxyDAL: {
      findByIdWithOrg: async () => ({ projectId: PROJECT_ID, orgId: "org-1", pollInterval: 60 })
    } as never,
    agentVaultResolveDAL: { findResolvableServices: async () => rows },
    agentVaultServiceCustomHeaderDAL: { findByServiceIds: async () => [] },
    agentVaultServiceSubstitutionDAL: { findByServiceIds: async () => [] },
    agentVaultVariableDAL: { findValuesForResolve: async () => [] },
    agentVaultSessionDAL: {
      findByTokenHash: async () =>
        ({ id: "session-1", projectId: PROJECT_ID, userId: "user-1", revokedAt: null, expiresAt: null }) as never
    },
    agentVaultSessionLogConfigDAL: {
      findOne: async () => ({
        id: "logs-config",
        projectId: PROJECT_ID,
        enabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    },
    membershipDAL: { findResourceMembershipsForActor: async () => [] },
    orgDAL: { findEffectiveOrgMembership: async () => ({ isActive: true }) as never },
    permissionService: {
      getProjectPermission: async () =>
        ({
          permission: createMongoAbility([
            {
              action: ProjectPermissionAgentVaultSessionActions.Read,
              subject: ProjectPermissionSub.AgentVaultSessions
            }
          ]),
          hasRole: () => true,
          memberships: []
        }) as never
    },
    kmsService: {
      createCipherPairWithDataKey: async () =>
        ({ decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob }) as never
    },
    licenseService: {} as never,
    resourceAuthMethodService: {} as never,
    agentVaultOauthService: { refreshServiceToken: refreshServiceToken as never }
  });
  return { service, refreshServiceToken };
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
