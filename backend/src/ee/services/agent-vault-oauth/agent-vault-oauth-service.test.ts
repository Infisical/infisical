import crypto from "node:crypto";

import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import { toOauthVariableSettings } from "../agent-vault-variable/agent-vault-oauth-variable-fns";
import {
  TAgentVaultOauthVariableConfig,
  TAgentVaultOauthVariableSettingsInput
} from "../agent-vault-variable/agent-vault-variable-types";
import {
  AgentVaultCredentialType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultOauthStatus,
  AgentVaultOauthVariableConnectMethod,
  AgentVaultServiceType,
  AgentVaultVariableType
} from "../agent-vault/agent-vault-enums";
import { MAX_OAUTH_SCOPES } from "./agent-vault-oauth-discovery-fns";
import { TOauthHttpClient, TOauthHttpResponse } from "./agent-vault-oauth-http-fns";
import {
  AGENT_VAULT_OAUTH_VARIABLE_CHANGED_MESSAGE,
  AGENT_VAULT_SERVICE_MOVED_MESSAGE,
  AGENT_VAULT_SERVICE_VARIABLE_CHANGED_MESSAGE,
  agentVaultOauthServiceFactory,
  checkOauthClaimUnderLock,
  checkOauthServerUnderLock
} from "./agent-vault-oauth-service";
import { hashAccessToken, memberOauthSetupOf } from "./agent-vault-oauth-token-fns";
import {
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthCompatibility,
  AgentVaultOauthRegistration,
  TAgentVaultOauthAuthorization,
  TAgentVaultOauthConfig,
  TAgentVaultOauthSecret
} from "./agent-vault-oauth-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.infisical.test" }) }));

vi.mock("@app/lib/logger", async () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (
    await vi.importActual<typeof import("@app/lib/logger/sanitize-url")>("@app/lib/logger/sanitize-url")
  ).sanitizeUrlForLog
}));

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const BUNDLE_ID = "22222222-2222-4222-8222-222222222222";
const SERVICE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_USER_ID = "55555555-5555-4555-8555-555555555555";
const SERVER_URL = "https://mcp.linear.app/mcp";
const REDIRECT_URI = "https://app.infisical.test/agent-vault/oauth/callback";
const DESTINATION = { hostPattern: "mcp.linear.app", serverUrl: SERVER_URL };

const ctxOf = (actorId: string) => ({
  actor: ActorType.USER,
  actorId,
  actorOrgId: "org-1",
  actorAuthMethod: null
});

const json = (status: number, body: unknown): TOauthHttpResponse => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body)
});

// The fake cipher is reversible and visibly "sealed", so a test can tell sealed bytes from plaintext.
const SEAL_PREFIX = Buffer.from("sealed:");
const sealBytes = (value: unknown) => Buffer.concat([SEAL_PREFIX, Buffer.from(JSON.stringify(value))]);
const openBytes = <T>(blob: Buffer) => JSON.parse(blob.subarray(SEAL_PREFIX.length).toString("utf-8")) as T;

type TRow = {
  id: string;
  name: string;
  type: string;
  credentialType: string;
  credentialConfig: unknown;
  encryptedCredential: Buffer | null;
  memberProvidedFields?: string[] | null;
  hostPattern?: string;
  config?: unknown;
  // Set on a session's own service.
  sessionId?: string | null;
  secretsDeletedAt?: Date | null;
};

// A member's connection: their personal value for `credential-value` on a service that leaves sign-in to members.
type TPersonalRow = { id: string; serviceId: string; userId: string; encryptedValue: Buffer; oauthConfig: unknown };

type TVariableRow = {
  id: string;
  projectId: string;
  key: string;
  type: string;
  userId: string | null;
  identityId: string | null;
  encryptedValue: Buffer | null;
  oauthConfig: TAgentVaultOauthVariableConfig | null;
};

const LINEAR_JSON: Record<string, unknown> = {
  "https://mcp.linear.app/.well-known/oauth-protected-resource/mcp": {
    resource: SERVER_URL,
    authorization_servers: ["https://mcp.linear.app"],
    scopes_supported: ["read", "write"]
  },
  "https://mcp.linear.app/.well-known/oauth-authorization-server": {
    issuer: "https://mcp.linear.app",
    authorization_endpoint: "https://mcp.linear.app/authorize",
    token_endpoint: "https://mcp.linear.app/token",
    registration_endpoint: "https://mcp.linear.app/register",
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true
  }
};

const setup = ({
  metadata = LINEAR_JSON,
  canEditBundles = true,
  challenge = `Bearer resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp"`,
  isAdmin = true,
  grantedBundleIds = [BUNDLE_ID],
  canEditVariables = true,
  canReadVariables = true
}: {
  metadata?: Record<string, unknown>;
  canEditBundles?: boolean;
  canEditVariables?: boolean;
  canReadVariables?: boolean;
  challenge?: string | null;
  // A member reaches only the bundles they hold a grant on; an admin reaches every one.
  isAdmin?: boolean;
  grantedBundleIds?: string[];
} = {}) => {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const rows = new Map<string, TRow>();
  const personalRows = new Map<string, TPersonalRow>();
  const variableRows = new Map<string, TVariableRow>();
  // structuredClone turns a Buffer into a plain Uint8Array, so the sealed value is copied on its own.
  const cloneVariable = (row: TVariableRow) => ({
    ...structuredClone({ ...row, encryptedValue: null }),
    encryptedValue: row.encryptedValue ? Buffer.from(row.encryptedValue) : null
  });
  const permissions = { canEditVariables, canReadVariables };
  const tokenRequests: URLSearchParams[] = [];
  const registrations: unknown[] = [];
  const lockKeys: string[][] = [];
  let registerHandler: () => TOauthHttpResponse = () => json(201, { client_id: "registered-client" });
  let lockHandler: (settings: unknown) => Promise<void> = async () => {};
  let variableWriteError: Error | null = null;
  let beforeSetItem: (key: string) => void = () => {};
  let lockTail = Promise.resolve();
  let tokenHandler: (form: URLSearchParams) => TOauthHttpResponse = () =>
    json(200, { access_token: "at-1", token_type: "Bearer", refresh_token: "rt-1", expires_in: 3600, scope: "read" });

  const http: TOauthHttpClient = {
    probe: async () =>
      challenge ? { status: 401, wwwAuthenticate: challenge } : { status: 200, wwwAuthenticate: null },
    get: async (url) =>
      url in metadata ? json(200, metadata[url]) : { status: 404, contentType: "text/plain", body: "" },
    postJson: async (_url, body) => {
      registrations.push(body);
      return registerHandler();
    },
    postForm: async (_url, form) => {
      tokenRequests.push(form);
      return tokenHandler(form);
    }
  };

  let decrypts = 0;
  const kms = {
    createCipherPairWithDataKey: async () => ({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({
        cipherTextBlob: Buffer.concat([SEAL_PREFIX, plainText])
      }),
      decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => {
        decrypts += 1;
        return cipherTextBlob.subarray(SEAL_PREFIX.length);
      }
    })
  };

  const service = agentVaultOauthServiceFactory({
    http,
    keyStore: {
      getItemPrimary: async (key: string) => store.get(key) ?? null,
      setItemWithExpiry: async (key: string, ttl: number | string, value: string | number | Buffer) => {
        beforeSetItem(key);
        store.set(key, String(value));
        ttls.set(key, Number(ttl));
        return "OK" as const;
      },
      setItemWithExpiryNX: async (key: string, _ttl: number | string, value: string | number | Buffer) => {
        if (store.has(key)) return null;
        store.set(key, String(value));
        return "OK" as const;
      },
      deleteItem: async (key: string) => (store.delete(key) ? 1 : 0),
      ttl: async (key: string) => (store.has(key) ? (ttls.get(key) ?? -1) : -2),
      // A real mutex, so a second caller waits until the first one releases.
      acquireLock: async (keys: string[], _duration: number, settings?: unknown) => {
        lockKeys.push(keys);
        await lockHandler(settings);
        const previous = lockTail;
        let unlock = () => {};
        lockTail = new Promise((resolve) => {
          unlock = resolve;
        });
        await previous;
        return {
          release: async () => {
            unlock();
            return {} as never;
          }
        };
      }
    },
    kmsDataKeyService: kms as never,
    agentVaultServiceDAL: {
      findByIdInProject: async ({ id }: { id: string }) => rows.get(id) as never,
      // Every service is in the one bundle these tests use, and a filter narrows to the bundles it names, as the SQL does.
      findBundlesForServices: async (serviceIds: string[], accessBundleIds: string[] | null) =>
        new Map(
          serviceIds.map((id) => [
            id,
            !accessBundleIds || accessBundleIds.includes(BUNDLE_ID) ? [{ id: BUNDLE_ID, name: "bundle" }] : []
          ])
        ) as never,
      findByIdPrimary: async (id: string) => {
        const row = rows.get(id);
        return (row ? { ...row, credentialConfig: structuredClone(row.credentialConfig) } : undefined) as never;
      },
      // Mirrors the SQL: the compare is on the sealed credential only, and `keepAdditionalScopesStatus` is decided on
      // the row being written.
      compareAndSwapCredential: async ({
        id,
        expectedEncryptedCredential,
        encryptedCredential,
        credentialConfigPatch,
        keepAdditionalScopesStatus
      }: {
        id: string;
        expectedEncryptedCredential: Buffer;
        encryptedCredential?: Buffer;
        credentialConfigPatch: Record<string, unknown>;
        keepAdditionalScopesStatus?: boolean;
      }) => {
        const row = rows.get(id);
        if (!row?.encryptedCredential?.equals(expectedEncryptedCredential)) return undefined;
        if (encryptedCredential) row.encryptedCredential = encryptedCredential;
        const stored = row.credentialConfig as Record<string, unknown>;
        const patch =
          keepAdditionalScopesStatus && stored.status === AgentVaultOauthStatus.NeedsAdditionalScopes
            ? Object.fromEntries(Object.entries(credentialConfigPatch).filter(([key]) => key !== "status"))
            : credentialConfigPatch;
        row.credentialConfig = { ...stored, ...patch };
        return {
          id,
          hostPattern: row.hostPattern ?? "",
          config: row.config ?? null,
          credentialConfig: structuredClone(row.credentialConfig)
        } as never;
      },
      // Mirrors the SQL: every condition and the union are evaluated on the row being written.
      addRequiredScopes: async ({
        id,
        expectedEncryptedCredential,
        rejectedTokenHash,
        requiredScopes
      }: {
        id: string;
        expectedEncryptedCredential: Buffer;
        rejectedTokenHash: string;
        requiredScopes: string[];
      }) => {
        // Lets a concurrent report run between the caller's read and this write.
        await new Promise((resolve) => {
          setImmediate(resolve);
        });
        const row = rows.get(id);
        const stored = row?.credentialConfig as TAgentVaultOauthConfig | undefined;
        const granted = stored?.grantedScopes ?? [];
        const missing = [...new Set(requiredScopes)].filter((scope) => !granted.includes(scope));
        if (
          !row?.encryptedCredential?.equals(expectedEncryptedCredential) ||
          row.credentialType !== AgentVaultCredentialType.OAuth ||
          stored?.accessTokenHash !== rejectedTokenHash ||
          stored.status === AgentVaultOauthStatus.NeedsReauthorization ||
          !missing.length
        ) {
          return undefined;
        }
        const existing = stored.requiredScopes ?? [];
        const added = missing.filter((scope) => !existing.includes(scope));
        row.credentialConfig = {
          ...stored,
          status: AgentVaultOauthStatus.NeedsAdditionalScopes,
          requiredScopes: [...existing, ...added.slice(0, Math.max(0, MAX_OAUTH_SCOPES - existing.length))]
        };
        return {
          id,
          hostPattern: row.hostPattern ?? "",
          config: row.config ?? null,
          credentialConfig: structuredClone(row.credentialConfig)
        } as never;
      }
    },
    agentVaultPersonalValueDAL: {
      findOauthForOwner: async ({ serviceId, owner }: { serviceId: string; owner: { userId?: string } }) => {
        const personal = [...personalRows.values()].find(
          (row) => row.serviceId === serviceId && row.userId === owner.userId
        );
        const serviceRow = rows.get(serviceId);
        return (
          personal && serviceRow
            ? {
                id: personal.id,
                encryptedValue: personal.encryptedValue,
                oauthConfig: structuredClone(personal.oauthConfig),
                hostPattern: serviceRow.hostPattern ?? "",
                config: serviceRow.config ?? null
              }
            : undefined
        ) as never;
      },
      compareAndSwapOauth: async ({
        id,
        expectedEncryptedValue,
        encryptedValue,
        oauthConfigPatch
      }: {
        id: string;
        expectedEncryptedValue: Buffer;
        encryptedValue?: Buffer;
        oauthConfigPatch: Record<string, unknown>;
      }) => {
        const row = personalRows.get(id);
        if (!row?.encryptedValue.equals(expectedEncryptedValue)) return undefined;
        if (encryptedValue) row.encryptedValue = encryptedValue;
        row.oauthConfig = { ...(row.oauthConfig as object), ...oauthConfigPatch };
        return { id, oauthConfig: structuredClone(row.oauthConfig) } as never;
      },
      addRequiredScopes: async ({
        id,
        expectedEncryptedValue,
        requiredScopes
      }: {
        id: string;
        expectedEncryptedValue: Buffer;
        requiredScopes: string[];
      }) => {
        const row = personalRows.get(id);
        if (!row?.encryptedValue.equals(expectedEncryptedValue)) return undefined;
        row.oauthConfig = {
          ...(row.oauthConfig as object),
          status: AgentVaultOauthStatus.NeedsAdditionalScopes,
          requiredScopes
        };
        return { id, oauthConfig: row.oauthConfig } as never;
      }
    },
    agentVaultVariableDAL: {
      findByIdInProject: async ({ id, projectId }: { id: string; projectId: string }) => {
        const row = variableRows.get(id);
        return (row && row.projectId === projectId ? cloneVariable(row) : undefined) as never;
      },
      lockByIdInProject: async ({ id, projectId }: { id: string; projectId: string }) => {
        const row = variableRows.get(id);
        return (row && row.projectId === projectId ? cloneVariable(row) : undefined) as never;
      },
      updateById: (async (id: string, data: Partial<TVariableRow>) => {
        if (variableWriteError) {
          const error = variableWriteError;
          variableWriteError = null;
          throw error;
        }
        const row = variableRows.get(id)!;
        Object.assign(row, { ...data, oauthConfig: structuredClone(data.oauthConfig ?? row.oauthConfig) });
        return row;
      }) as never,
      transaction: (async (fn: (tx: unknown) => Promise<unknown>) => fn({})) as never,
      findOauthByIdPrimary: async (id: string) => {
        const row = variableRows.get(id);
        return (
          row && row.type === AgentVaultVariableType.OAuth && !row.userId && !row.identityId
            ? cloneVariable(row)
            : undefined
        ) as never;
      },
      // Mirrors the SQL: the compare is on the sealed tokens only, and the patch merges into `connection`.
      compareAndSwapOauthConnection: async ({
        id,
        expectedEncryptedValue,
        encryptedValue,
        connectionPatch,
        keepAdditionalScopesStatus
      }: {
        id: string;
        expectedEncryptedValue: Buffer;
        encryptedValue?: Buffer;
        connectionPatch: Record<string, unknown>;
        keepAdditionalScopesStatus?: boolean;
      }) => {
        const row = variableRows.get(id);
        if (!row?.encryptedValue?.equals(expectedEncryptedValue) || !row.oauthConfig) return undefined;
        if (encryptedValue) row.encryptedValue = encryptedValue;
        const stored = (row.oauthConfig.connection ?? {}) as Record<string, unknown>;
        const patch =
          keepAdditionalScopesStatus && stored.status === AgentVaultOauthStatus.NeedsAdditionalScopes
            ? Object.fromEntries(Object.entries(connectionPatch).filter(([key]) => key !== "status"))
            : connectionPatch;
        row.oauthConfig = { ...row.oauthConfig, connection: { ...stored, ...patch } as never };
        return { id, key: row.key, oauthConfig: structuredClone(row.oauthConfig) } as never;
      },
      addOauthRequiredScopesToConnection: async ({
        id,
        expectedEncryptedValue,
        rejectedTokenHash,
        requiredScopes
      }: {
        id: string;
        expectedEncryptedValue: Buffer;
        rejectedTokenHash: string;
        requiredScopes: string[];
      }) => {
        const row = variableRows.get(id);
        const connection = row?.oauthConfig?.connection;
        if (!row?.encryptedValue?.equals(expectedEncryptedValue) || connection?.accessTokenHash !== rejectedTokenHash) {
          return undefined;
        }
        row.oauthConfig = {
          ...row.oauthConfig!,
          connection: { ...connection, status: AgentVaultOauthStatus.NeedsAdditionalScopes, requiredScopes }
        };
        return { id, oauthConfig: structuredClone(row.oauthConfig) } as never;
      }
    },
    // Mirrors the SQL: a session's own service only, and nothing once its secrets are deleted.
    agentVaultSessionInlineServiceDAL: {
      findOauthTokensByIdPrimary: async (id: string) => {
        const row = rows.get(id);
        return (
          row?.sessionId && !row.secretsDeletedAt && row.encryptedCredential
            ? { ...row, projectId: PROJECT_ID, credentialConfig: structuredClone(row.credentialConfig) }
            : undefined
        ) as never;
      },
      compareAndSwapOauthTokens: async ({
        id,
        expectedEncryptedCredential,
        encryptedCredential,
        credentialConfigPatch
      }: {
        id: string;
        expectedEncryptedCredential: Buffer;
        encryptedCredential?: Buffer;
        credentialConfigPatch: Record<string, unknown>;
      }) => {
        const row = rows.get(id);
        if (!row?.sessionId || row.secretsDeletedAt || !row.encryptedCredential?.equals(expectedEncryptedCredential)) {
          return undefined;
        }
        if (encryptedCredential) row.encryptedCredential = encryptedCredential;
        row.credentialConfig = { ...(row.credentialConfig as object), ...credentialConfigPatch };
        return {
          id,
          hostPattern: row.hostPattern ?? "",
          config: row.config ?? null,
          credentialConfig: structuredClone(row.credentialConfig)
        } as never;
      },
      addOauthRequiredScopes: async () => undefined
    },
    projectDAL: { findById: async () => ({ name: "Acme Support" }) as never },
    permissionService: {
      getProjectPermission: async () =>
        ({
          permission: createMongoAbility([
            ...(permissions.canEditVariables
              ? [
                  {
                    action: ProjectPermissionAgentVaultVariableActions.Edit,
                    subject: ProjectPermissionSub.AgentVaultVariables
                  }
                ]
              : []),
            ...(permissions.canReadVariables
              ? [
                  {
                    action: ProjectPermissionAgentVaultVariableActions.Read,
                    subject: ProjectPermissionSub.AgentVaultVariables
                  }
                ]
              : []),
            {
              action: ProjectPermissionAgentVaultAccessBundleActions.Read,
              subject: ProjectPermissionSub.AgentVaultAccessBundles
            },
            ...(canEditBundles
              ? [
                  {
                    action: ProjectPermissionAgentVaultAccessBundleActions.Edit,
                    subject: ProjectPermissionSub.AgentVaultAccessBundles
                  }
                ]
              : [])
          ]),
          hasRole: () => isAdmin,
          memberships: []
        }) as never
    },
    membershipDAL: {
      findResourceMembershipsForActor: async () =>
        grantedBundleIds.map((scopeResourceId) => ({ scopeResourceId, isActive: true, actorGroupId: null })) as never
    }
  });

  return {
    service,
    store,
    ttls,
    rows,
    personalRows,
    variableRows,
    permissions,
    tokenRequests,
    registrations,
    lockKeys,
    kms,
    decrypts: () => decrypts,
    onToken: (handler: typeof tokenHandler) => {
      tokenHandler = handler;
    },
    onRegister: (handler: typeof registerHandler) => {
      registerHandler = handler;
    },
    onAcquireLock: (handler: typeof lockHandler) => {
      lockHandler = handler;
    },
    failNextVariableWrite: (error: Error) => {
      variableWriteError = error;
    },
    onSetItem: (handler: typeof beforeSetItem) => {
      beforeSetItem = handler;
    }
  };
};

const createAuthorization = (env: ReturnType<typeof setup>, extra: Record<string, string> = {}) =>
  env.service.createAuthorization({
    projectId: PROJECT_ID,
    ctx: ctxOf(USER_ID),
    serverUrl: SERVER_URL,
    ...extra
  });

const authorize = async (env: ReturnType<typeof setup>) => {
  const { authorization } = await createAuthorization(env);
  const state = new URL(authorization!.authorizeUrl).searchParams.get("state")!;
  await env.service.completeAuthorization({
    projectId: PROJECT_ID,
    ctx: ctxOf(USER_ID),
    authorizationId: authorization!.id,
    state,
    code: "code-1",
    iss: "https://mcp.linear.app"
  });
  return authorization!.id;
};

const oauthConfig = (overrides: Partial<TAgentVaultOauthConfig> = {}): TAgentVaultOauthConfig => ({
  type: AgentVaultCredentialType.OAuth,
  grantType: OauthGrantType.AuthorizationCode,
  serverUrl: SERVER_URL,
  issuer: "https://mcp.linear.app",
  authorizationEndpoint: "https://mcp.linear.app/authorize",
  tokenEndpoint: "https://mcp.linear.app/token",
  resource: SERVER_URL,
  clientId: "registered-client",
  registration: AgentVaultOauthRegistration.Dynamic,
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None,
  compatibility: [],
  requestedScopes: ["read", "write"],
  grantedScopes: ["read"],
  requiredScopes: [],
  status: AgentVaultOauthStatus.Connected,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  accessTokenHash: hashAccessToken("old-access"),
  authorizedAt: new Date().toISOString(),
  lastRefreshedAt: null,
  lastError: null,
  ...overrides
});

// The start response carries only the authorize URL; what was asked for is on the stored record.
const storedAuthorization = (env: ReturnType<typeof setup>, id: string) =>
  JSON.parse(env.store.get(`agent-vault-oauth-authorization:${id}`)!) as TAgentVaultOauthAuthorization;

describe("starting an authorization", () => {
  test("discovers, registers a client, and returns an authorize URL with PKCE S256, resource and state", async () => {
    const env = setup();
    const result = await createAuthorization(env);

    expect(result.registrationRequired).toBe(false);
    const { authorization } = result;
    const url = new URL(authorization!.authorizeUrl);
    expect(url.origin + url.pathname).toBe("https://mcp.linear.app/authorize");
    expect(url.searchParams.get("client_id")).toBe("registered-client");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("resource")).toBe(SERVER_URL);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("state")!.startsWith(`${authorization!.id}.`)).toBe(true);
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(storedAuthorization(env, authorization!.id)).toMatchObject({
      requestedScopes: ["read", "write"],
      status: AgentVaultOauthAuthorizationStatus.Pending
    });
    expect(env.registrations).toHaveLength(1);

    // The PKCE verifier is sealed in Redis, never stored in plaintext.
    const raw = env.store.get(`agent-vault-oauth-authorization:${authorization!.id}`)!;
    expect(raw).not.toContain("codeVerifier");
  });

  test("a server without a registration endpoint asks for a client", async () => {
    vi.mocked(logger.warn).mockClear();
    const env = setup({
      metadata: {
        ...LINEAR_JSON,
        "https://mcp.linear.app/.well-known/oauth-authorization-server": {
          ...(LINEAR_JSON["https://mcp.linear.app/.well-known/oauth-authorization-server"] as object),
          registration_endpoint: undefined
        }
      }
    });
    expect(await createAuthorization(env)).toEqual({
      registrationRequired: true,
      oauthAdvertised: true,
      redirectUri: REDIRECT_URI,
      authorization: null
    });
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining("client registration failed"));
  });

  test("a registration endpoint that refuses asks for a client, and the reason is logged naming the host only", async () => {
    vi.mocked(logger.warn).mockClear();
    const env = setup();
    env.onRegister(() => json(400, { error: "invalid_redirect_uri", error_description: "Redirect URI not allowed" }));

    const result = await createAuthorization(env);
    expect(result).toEqual({
      registrationRequired: true,
      oauthAdvertised: true,
      redirectUri: REDIRECT_URI,
      authorization: null
    });
    expect(logger.warn).toHaveBeenCalledWith(
      `agentVaultOauth: client registration failed [projectId=${PROJECT_ID}] [server=mcp.linear.app] [error=its registration endpoint refused to register Infisical as a client (Redirect URI not allowed).]`
    );
  });

  test("a registration endpoint that can't be reached asks to try again, logged without the error text", async () => {
    vi.mocked(logger.warn).mockClear();
    const env = setup();
    env.onRegister(() => {
      throw new Error("connect ECONNREFUSED https://mcp.linear.app/register?token=abc");
    });
    await expect(createAuthorization(env)).rejects.toThrow(
      "Couldn't set up OAuth for 'mcp.linear.app': its registration endpoint couldn't be reached. Try again in a few minutes."
    );
    expect(logger.warn).toHaveBeenCalledWith(
      `agentVaultOauth: client registration failed [projectId=${PROJECT_ID}] [server=mcp.linear.app] [error=its registration endpoint couldn't be reached.]`
    );
    expect(vi.mocked(logger.warn).mock.calls.flat().join()).not.toContain("ECONNREFUSED");
  });

  test("a registration endpoint that is down asks to try again instead of for a client", async () => {
    const env = setup();
    env.onRegister(() => json(503, { error: "temporarily_unavailable" }));
    await expect(createAuthorization(env)).rejects.toThrow(
      /\(temporarily_unavailable\)\. Try again in a few minutes\.$/
    );
  });

  test("an admin-entered client is used as is, with no registration", async () => {
    const env = setup();
    const { authorization } = await createAuthorization(env, { clientId: "my-app", clientSecret: "shh" });
    expect(new URL(authorization!.authorizeUrl).searchParams.get("client_id")).toBe("my-app");
    expect(env.registrations).toHaveLength(0);
  });

  const storeOauthService = (env: ReturnType<typeof setup>, overrides: Partial<TAgentVaultOauthConfig> = {}) =>
    env.rows.set(SERVICE_ID, {
      id: SERVICE_ID,
      name: "linear",
      type: AgentVaultServiceType.Mcp,
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: oauthConfig({ clientId: "old-client", grantedScopes: ["admin"], ...overrides }),
      encryptedCredential: sealBytes({
        accessToken: "old-access",
        refreshToken: "old-refresh",
        clientSecret: "old-shh"
      })
    });
  const clientIdOf = (authorizeUrl: string) => new URL(authorizeUrl).searchParams.get("client_id");

  test("reauthorizing registers a fresh client instead of reusing a registered one the server may have dropped", async () => {
    const env = setup();
    storeOauthService(env);
    const { authorization } = await createAuthorization(env, { serviceId: SERVICE_ID });
    expect(env.registrations).toHaveLength(1);
    expect(clientIdOf(authorization!.authorizeUrl)).toBe("registered-client");
  });

  test("reauthorizing keeps a client entered by hand, since nothing can register it again", async () => {
    const env = setup();
    storeOauthService(env, { registration: AgentVaultOauthRegistration.Manual });
    const { authorization } = await createAuthorization(env, { serviceId: SERVICE_ID });
    expect(env.registrations).toHaveLength(0);
    expect(clientIdOf(authorization!.authorizeUrl)).toBe("old-client");
  });

  test("switching back to automatic setup registers a fresh client instead of the one entered by hand", async () => {
    const env = setup();
    storeOauthService(env, { registration: AgentVaultOauthRegistration.Manual });
    const { authorization } = await createAuthorization(env, {
      serviceId: SERVICE_ID,
      registration: AgentVaultOauthRegistration.Dynamic
    });
    expect(env.registrations).toHaveLength(1);
    expect(clientIdOf(authorization!.authorizeUrl)).toBe("registered-client");
    expect(storedAuthorization(env, authorization!.id).requestedScopes).toEqual(["admin"]);
  });

  test("switching back to automatic setup never falls back to the client entered by hand", async () => {
    const env = setup();
    env.onRegister(() => json(400, { error: "invalid_client_metadata" }));
    storeOauthService(env, { registration: AgentVaultOauthRegistration.Manual });
    const result = await createAuthorization(env, {
      serviceId: SERVICE_ID,
      registration: AgentVaultOauthRegistration.Dynamic
    });
    expect(result.registrationRequired).toBe(true);
    expect(result.authorization).toBeNull();
  });

  test("a client ID together with registration 'dynamic' is refused", async () => {
    await expect(
      createAuthorization(setup(), { clientId: "my-app", registration: AgentVaultOauthRegistration.Dynamic })
    ).rejects.toThrow(/not both/);
  });

  test("reauthorizing falls back to the stored client when a fresh one can't be registered", async () => {
    const env = setup();
    env.onRegister(() => json(400, { error: "invalid_client_metadata" }));
    storeOauthService(env);
    const result = await createAuthorization(env, { serviceId: SERVICE_ID });
    expect(result.registrationRequired).toBe(false);
    expect(clientIdOf(result.authorization!.authorizeUrl)).toBe("old-client");
    const record = JSON.parse(
      env.store.get(`agent-vault-oauth-authorization:${result.authorization!.id}`)!
    ) as TAgentVaultOauthAuthorization;
    expect(record.registration).toBe(AgentVaultOauthRegistration.Dynamic);
  });

  test("reauthorizing at a different issuer uses neither the stored client nor its scopes", async () => {
    const env = setup({
      metadata: {
        ...LINEAR_JSON,
        "https://mcp.linear.app/.well-known/oauth-authorization-server": {
          ...(LINEAR_JSON["https://mcp.linear.app/.well-known/oauth-authorization-server"] as object),
          registration_endpoint: undefined
        }
      }
    });
    storeOauthService(env, { registration: AgentVaultOauthRegistration.Manual, issuer: "https://old.example.com" });
    expect((await createAuthorization(env, { serviceId: SERVICE_ID })).registrationRequired).toBe(true);

    const { authorization } = await createAuthorization(env, { serviceId: SERVICE_ID, clientId: "my-app" });
    expect(storedAuthorization(env, authorization!.id).requestedScopes).toEqual(["read", "write"]);
  });

  test("reauthorizing at the same issuer asks again for the scopes the service holds and still needs", async () => {
    const env = setup();
    storeOauthService(env, { requiredScopes: ["write"] });
    const { authorization } = await createAuthorization(env, { serviceId: SERVICE_ID });
    expect(storedAuthorization(env, authorization!.id).requestedScopes).toEqual(["admin", "write"]);
  });

  test("a client secret without a client ID is refused", async () => {
    await expect(createAuthorization(setup(), { clientSecret: "shh" })).rejects.toThrow(/client ID/);
  });

  test("a caller who can't edit access bundles is refused before any request to the server", async () => {
    const env = setup({ canEditBundles: false });
    await expect(createAuthorization(env)).rejects.toThrow(ForbiddenError);
    expect(env.registrations).toHaveLength(0);
  });

  test("a machine identity is refused, since signing in to the provider needs a browser", async () => {
    const env = setup();
    await expect(
      env.service.createAuthorization({
        projectId: PROJECT_ID,
        ctx: { ...ctxOf(USER_ID), actor: ActorType.IDENTITY },
        serverUrl: SERVER_URL
      })
    ).rejects.toThrow("Only a user can authorize an OAuth connection");
  });

  test("an HTTP service can't be authorized, since only MCP services use OAuth", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, {
      id: SERVICE_ID,
      name: "stripe",
      type: AgentVaultServiceType.Http,
      credentialType: AgentVaultCredentialType.Bearer,
      credentialConfig: {},
      encryptedCredential: null,
      hostPattern: "api.stripe.com",
      config: null
    });
    await expect(createAuthorization(env, { serviceId: SERVICE_ID })).rejects.toThrow(
      "The service 'stripe' is an HTTP service. Only MCP services use OAuth."
    );
  });

  test("an unknown service is a 404", async () => {
    const env = setup();
    await expect(
      env.service.createAuthorization({
        projectId: PROJECT_ID,
        ctx: ctxOf(USER_ID),
        serviceId: "99999999-9999-4999-8999-999999999999",
        serverUrl: SERVER_URL
      })
    ).rejects.toThrow(/not found/);
  });
});

describe("completing an authorization", () => {
  test("the creator cannot read, complete or claim an authorization through a different project", async () => {
    const env = setup();
    const { authorization } = await createAuthorization(env);
    const projectId = "99999999-9999-4999-8999-999999999999";
    const state = new URL(authorization!.authorizeUrl).searchParams.get("state")!;
    await expect(
      env.service.getAuthorization({ projectId, ctx: ctxOf(USER_ID), authorizationId: authorization!.id })
    ).rejects.toThrow(NotFoundError);
    await expect(
      env.service.completeAuthorization({
        projectId,
        ctx: ctxOf(USER_ID),
        authorizationId: authorization!.id,
        state,
        code: "code-1"
      })
    ).rejects.toThrow(NotFoundError);
    await expect(
      env.service.claimAuthorization({
        projectId,
        ctx: ctxOf(USER_ID),
        authorizationId: authorization!.id,
        serverUrl: SERVER_URL
      })
    ).rejects.toThrow(NotFoundError);
    expect(env.tokenRequests).toHaveLength(0);
    expect(env.store.size).toBe(1);
  });

  test("exchanges the code with the PKCE verifier and resource, and never returns a token", async () => {
    const env = setup();
    const { authorization } = await createAuthorization(env);
    const url = new URL(authorization!.authorizeUrl);

    const { authorization: view } = await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state: url.searchParams.get("state")!,
      code: "code-1",
      iss: "https://mcp.linear.app"
    });

    expect(view).toEqual({
      id: authorization!.id,
      status: AgentVaultOauthAuthorizationStatus.Authorized,
      error: null,
      scopes: ["read"]
    });
    const [form] = env.tokenRequests;
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("code-1");
    expect(form.get("resource")).toBe(SERVER_URL);
    expect(form.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(crypto.createHash("sha256").update(form.get("code_verifier")!).digest("base64url")).toBe(
      url.searchParams.get("code_challenge")
    );
    expect(
      JSON.stringify(
        await env.service.getAuthorization({
          projectId: PROJECT_ID,
          ctx: ctxOf(USER_ID),
          authorizationId: authorization!.id
        })
      )
    ).not.toContain("at-1");
  });

  test("another user gets a 404, and a wrong state a 400", async () => {
    const env = setup();
    const { authorization } = await createAuthorization(env);
    const state = new URL(authorization!.authorizeUrl).searchParams.get("state")!;

    await expect(
      env.service.completeAuthorization({
        projectId: PROJECT_ID,
        ctx: ctxOf(OTHER_USER_ID),
        authorizationId: authorization!.id,
        state,
        code: "c"
      })
    ).rejects.toThrow(/not found/);
    await expect(
      env.service.getAuthorization({
        projectId: PROJECT_ID,
        ctx: ctxOf(OTHER_USER_ID),
        authorizationId: authorization!.id
      })
    ).rejects.toThrow(/not found/);
    await expect(
      env.service.completeAuthorization({
        projectId: PROJECT_ID,
        ctx: ctxOf(USER_ID),
        authorizationId: authorization!.id,
        state: `${authorization!.id}.forged`,
        code: "c"
      })
    ).rejects.toThrow(/doesn't belong/);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("an iss from another server fails it before the code is used", async () => {
    const env = setup();
    const { authorization } = await createAuthorization(env);
    const { authorization: view } = await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state: new URL(authorization!.authorizeUrl).searchParams.get("state")!,
      code: "c",
      iss: "https://evil.example.com"
    });
    expect(view.status).toBe(AgentVaultOauthAuthorizationStatus.Failed);
    expect(view.error).toMatch(/different server/);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test.each([
    { iss: "https://evil.example.com", problem: /different server/ },
    { iss: undefined, problem: /didn't say which server issued it/ }
  ])("an error response with iss $iss never shows the provider's text", async ({ iss, problem }) => {
    const env = setup();
    const { authorization } = await createAuthorization(env);
    const { authorization: view } = await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state: new URL(authorization!.authorizeUrl).searchParams.get("state")!,
      error: "server_error",
      errorDescription: "Visit https://evil.example.com/login to fix this",
      iss
    });
    expect(view.status).toBe(AgentVaultOauthAuthorizationStatus.Failed);
    expect(view.error).toMatch(problem);
    expect(view.error).not.toMatch(/Visit|didn't authorize/);
  });

  test("a missing iss from a server that advertises it fails", async () => {
    const env = setup();
    const { authorization } = await createAuthorization(env);
    const { authorization: view } = await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state: new URL(authorization!.authorizeUrl).searchParams.get("state")!,
      code: "c"
    });
    expect(view.status).toBe(AgentVaultOauthAuthorizationStatus.Failed);
  });

  test("a multi-line or long reason from the provider still fails the authorization, normalized", async () => {
    const env = setup();
    const { authorization } = await createAuthorization(env);
    const view = await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state: new URL(authorization!.authorizeUrl).searchParams.get("state")!,
      error: "server_error",
      errorDescription: `The admin\r\n\tdisabled\u202e this app. ${"x".repeat(3000)}`,
      iss: "https://mcp.linear.app"
    });
    expect(view.authorization.status).toBe(AgentVaultOauthAuthorizationStatus.Failed);
    expect(view.authorization.error).toMatch(
      /^'mcp\.linear\.app' didn't authorize Infisical: The admin disabled this app\. x+$/
    );
    expect(view.authorization.error!.length).toBeLessThan(600);
  });

  test("a denied authorization and a failed exchange are readable failures, not errors", async () => {
    const denied = setup();
    const first = (await createAuthorization(denied)).authorization!;
    const deniedView = await denied.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: first.id,
      state: new URL(first.authorizeUrl).searchParams.get("state")!,
      error: "access_denied",
      iss: "https://mcp.linear.app"
    });
    expect(deniedView.authorization.error).toBe("Access to 'mcp.linear.app' was denied, so nothing was connected.");

    const refused = setup();
    refused.onToken(() => json(400, { error: "invalid_grant", error_description: "Code expired" }));
    const second = (await createAuthorization(refused)).authorization!;
    const refusedView = await refused.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: second.id,
      state: new URL(second.authorizeUrl).searchParams.get("state")!,
      code: "c",
      iss: "https://mcp.linear.app"
    });
    expect(refusedView.authorization).toMatchObject({
      status: AgentVaultOauthAuthorizationStatus.Failed,
      error: "The login server 'mcp.linear.app' refused the token request: Code expired"
    });
  });

  test("an exchange refused with only an error code still stores a normalized reason", async () => {
    const env = setup();
    env.onToken(() => json(400, { error: "bad\u0000code‮" }));
    const { authorization } = await createAuthorization(env);
    const view = await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state: new URL(authorization!.authorizeUrl).searchParams.get("state")!,
      code: "test-authorization-code",
      iss: "https://mcp.linear.app"
    });
    expect(view.authorization.error).toBe("The login server 'mcp.linear.app' refused the token request: bad code");
  });

  test("comma-joined scopes from the exchange are granted as the scopes asked for, and recorded", async () => {
    const env = setup();
    env.onToken(() => json(200, { access_token: "at-1", token_type: "Bearer", scope: "read,write" }));
    const id = await authorize(env);
    const record = JSON.parse(env.store.get(`agent-vault-oauth-authorization:${id}`)!) as TAgentVaultOauthAuthorization;
    expect(record.grantedScopes).toEqual(["read", "write"]);
    expect(record.compatibility).toContain(AgentVaultOauthCompatibility.ScopeCommaSeparated);
    expect(record.expiresAt).toBeNull();
  });
});

describe("using an authorization", () => {
  const claimArgs = {
    projectId: PROJECT_ID,
    ctx: ctxOf(USER_ID),
    serverUrl: SERVER_URL
  };

  test("only once it is authorized, and only for the same bundle, user and server URL", async () => {
    const env = setup();
    const { authorization } = await createAuthorization(env);
    await expect(env.service.claimAuthorization({ ...claimArgs, authorizationId: authorization!.id })).rejects.toThrow(
      /hasn't finished/
    );

    const id = await authorize(env);
    const otherPath = env.service.claimAuthorization({
      ...claimArgs,
      authorizationId: id,
      serverUrl: "https://mcp.linear.app/secret-key-in-path"
    });
    await expect(otherPath).rejects.toThrow(/Authorize again for the new URL/);
    await expect(otherPath).rejects.not.toThrow(/secret-key-in-path|\/mcp/);
    await expect(
      env.service.claimAuthorization({ ...claimArgs, authorizationId: id, serverUrl: "https://other.example.com/k" })
    ).rejects.toThrow("This authorization is for 'mcp.linear.app', but the service's server is 'other.example.com'.");
    await expect(
      env.service.claimAuthorization({ ...claimArgs, authorizationId: id, ctx: ctxOf(OTHER_USER_ID) })
    ).rejects.toThrow(/not found/);
  });

  test("a claim uses it up, and another claim is refused with a readable error", async () => {
    const env = setup();
    const id = await authorize(env);

    await expect(
      env.service.claimAuthorization({ ...claimArgs, authorizationId: id, ctx: ctxOf(OTHER_USER_ID) })
    ).rejects.toThrow(NotFoundError);
    const { record } = await env.service.claimAuthorization({ ...claimArgs, authorizationId: id });
    const { config, encryptedCredential } = env.service.buildCredentialFromAuthorization(record);

    expect(openBytes<TAgentVaultOauthSecret>(encryptedCredential)).toEqual({
      accessToken: "at-1",
      refreshToken: "rt-1"
    });
    expect(config).toMatchObject({
      type: AgentVaultCredentialType.OAuth,
      status: AgentVaultOauthStatus.Connected,
      issuer: "https://mcp.linear.app",
      clientId: "registered-client",
      registration: AgentVaultOauthRegistration.Dynamic,
      grantedScopes: ["read"],
      accessTokenHash: hashAccessToken("at-1")
    });
    expect(env.store.size).toBe(0);
    await expect(env.service.claimAuthorization({ ...claimArgs, authorizationId: id })).rejects.toThrow(
      "It may have expired or was already used. Authorize the service again."
    );
  });

  test("two saves claiming it at once end with exactly one winner", async () => {
    const env = setup();
    const id = await authorize(env);

    const results = await Promise.allSettled([
      env.service.claimAuthorization({ ...claimArgs, authorizationId: id }),
      env.service.claimAuthorization({ ...claimArgs, authorizationId: id })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [lost] = results.filter((result) => result.status === "rejected");
    expect(lost.reason).toBeInstanceOf(ConflictError);
    expect((lost.reason as Error).message).toBe(
      "This authorization was already used by another save. Authorize the service again."
    );
  });

  test("a failed save restores it exactly, with the TTL it had left, so a retry can use it", async () => {
    const env = setup();
    const id = await authorize(env);
    const [key] = [...env.store.keys()];
    const stored = env.store.get(key);
    env.ttls.set(key, 123);

    const first = await env.service.claimAuthorization({ ...claimArgs, authorizationId: id });
    expect(env.store.has(key)).toBe(false);
    await first.restore();

    expect(env.store.get(key)).toBe(stored);
    expect(env.ttls.get(key)).toBe(123);
    const retry = await env.service.claimAuthorization({ ...claimArgs, authorizationId: id });
    expect(retry.record).toEqual(first.record);
  });

  test("a validation failure consumes nothing, and a restore with no TTL left writes nothing", async () => {
    const env = setup();
    const id = await authorize(env);
    const [key] = [...env.store.keys()];

    await expect(
      env.service.claimAuthorization({ ...claimArgs, authorizationId: id, serverUrl: "https://other.example.com/k" })
    ).rejects.toThrow(/but the service's server is/);
    expect(env.store.has(key)).toBe(true);

    env.ttls.set(key, -1);
    const claim = await env.service.claimAuthorization({ ...claimArgs, authorizationId: id });
    await claim.restore();
    expect(env.store.has(key)).toBe(false);
  });

  test("a reauthorization is tied to its service", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, {
      id: SERVICE_ID,
      name: "linear",
      type: AgentVaultServiceType.Mcp,
      credentialType: AgentVaultCredentialType.Bearer,
      credentialConfig: {},
      encryptedCredential: sealBytes({ value: "pat" })
    });
    const { authorization } = await createAuthorization(env, { serviceId: SERVICE_ID });
    const state = new URL(authorization!.authorizeUrl).searchParams.get("state")!;
    await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state,
      code: "c",
      iss: "https://mcp.linear.app"
    });
    await expect(env.service.claimAuthorization({ ...claimArgs, authorizationId: authorization!.id })).rejects.toThrow(
      /can't create a new one/
    );
    await expect(
      env.service.claimAuthorization({ ...claimArgs, authorizationId: authorization!.id, serviceId: SERVICE_ID })
    ).resolves.toBeDefined();
  });
});

describe("refreshing a service's token", () => {
  let env: ReturnType<typeof setup>;
  const row = () => env.rows.get(SERVICE_ID)!;
  const config = () => row().credentialConfig as TAgentVaultOauthConfig;

  beforeEach(() => {
    env = setup();
    env.rows.set(SERVICE_ID, {
      id: SERVICE_ID,
      name: "linear",
      type: AgentVaultServiceType.Mcp,
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: oauthConfig(),
      encryptedCredential: sealBytes({ accessToken: "old-access", refreshToken: "old-refresh" }),
      hostPattern: "mcp.linear.app",
      config: { serverUrl: SERVER_URL, transport: "streamable-http" }
    });
  });

  test("a rejected token that is no longer current returns the current one without calling the provider", async () => {
    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("older-access")
    });
    expect(result.credential).toEqual({
      type: "bearer",
      headerName: "Authorization",
      headerPrefix: "Bearer",
      value: "old-access",
      source: "oauth",
      expiresAt: config().expiresAt
    });
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("the current token rejected is refreshed with resource, and the old refresh token kept if none came back", async () => {
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 }));
    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });

    expect(result.credential.value).toBe("new-access");
    expect(result.status).toBe(AgentVaultOauthStatus.Connected);
    expect(Object.fromEntries(env.tokenRequests[0])).toEqual({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
      resource: SERVER_URL,
      client_id: "registered-client"
    });
    expect(openBytes<TAgentVaultOauthSecret>(row().encryptedCredential!)).toEqual({
      accessToken: "new-access",
      refreshToken: "old-refresh"
    });
    expect(config()).toMatchObject({ accessTokenHash: hashAccessToken("new-access"), lastError: null });
    expect(config().lastRefreshedAt).not.toBeNull();
  });

  test("a reauthorization that lands mid-refresh wins: the swap writes nothing and the newer token is returned", async () => {
    env.onToken(() => {
      // An admin reauthorized while the provider was answering.
      row().encryptedCredential = sealBytes({ accessToken: "reauthorized-access", refreshToken: "rt-new" });
      row().credentialConfig = oauthConfig({ accessTokenHash: hashAccessToken("reauthorized-access") });
      return json(200, { access_token: "stale-refresh-access", token_type: "Bearer", expires_in: 600 });
    });

    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });

    expect(result.credential.value).toBe("reauthorized-access");
    expect(openBytes<TAgentVaultOauthSecret>(row().encryptedCredential!).accessToken).toBe("reauthorized-access");
  });

  test("two refreshes of the same rejected token reach the provider once, and both get the new token", async () => {
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 }));
    const refresh = () =>
      env.service.refreshServiceToken({
        serviceId: SERVICE_ID,
        projectId: PROJECT_ID,
        destination: DESTINATION,
        rejectedTokenHash: hashAccessToken("old-access")
      });
    const results = await Promise.all([refresh(), refresh()]);
    expect(env.tokenRequests).toHaveLength(1);
    expect(results.map((result) => result.credential.value)).toEqual(["new-access", "new-access"]);
  });

  test("invalid_grant marks the service as needing reauthorization", async () => {
    env.onToken(() => json(400, { error: "invalid_grant" }));
    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });
    expect(result.status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect(result.credential.value).toBe("old-access");
    expect(config().status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect(config().lastError).toMatch(/Reauthorize this service/);
  });

  test.each([
    { error: "invalid_client", status: 401, why: "the server dropped the registered client" },
    { error: "unauthorized_client", status: 400, why: "the client may no longer use this grant" },
    { error: "bad_refresh_token", status: 200, why: "GitHub, with a 200" },
    { error: "incorrect_client_credentials", status: 200, why: "GitHub's invalid_client, with a 200" },
    { error: "invalid_refresh_token", status: 200, why: "Slack, with ok: false" },
    { error: "token_revoked", status: 200, why: "Slack" },
    { error: "token_expired", status: 200, why: "Slack" },
    { error: "bad_client_secret", status: 200, why: "Slack's invalid_client" },
    { error: "invalid_client_id", status: 200, why: "Slack's invalid_client" }
  ])("$error marks the service as needing reauthorization ($why)", async ({ error, status }) => {
    env.onToken(() => json(status, { ok: false, error }));
    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });
    expect(result.status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect(config().lastError).toBe(
      `This service's login is no longer accepted (The login server 'mcp.linear.app' refused the token request: ${error}). Reauthorize this service.`
    );

    // A dead login isn't retried on the next poll.
    await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });
    expect(env.tokenRequests).toHaveLength(1);
  });

  test("the proxy's refresh after a 401 waits longer for a concurrent refresh than resolve does", async () => {
    const waits: number[] = [];
    env.onAcquireLock(async (settings) => {
      const { retryCount, retryDelay } = settings as { retryCount: number; retryDelay: number };
      waits.push(retryCount * retryDelay);
    });
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 }));
    await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });
    row().credentialConfig = oauthConfig({
      accessTokenHash: hashAccessToken("new-access"),
      expiresAt: new Date(Date.now() + 30_000).toISOString()
    });
    await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      expiresWithinSeconds: 60
    });
    expect(waits).toHaveLength(2);
    // Outlasts the holder's 7 second token budget, yet stays under the proxy's 15 second timeout.
    expect(waits[0]).toBeGreaterThan(7_000);
    expect(waits[0]).toBeLessThan(15_000);
    expect(waits[1]).toBeLessThanOrEqual(3_000);
  });

  test("a refresh that waited out a failed holder only spends the time left before the proxy gives up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      env.onAcquireLock(async () => {
        vi.setSystemTime(Date.now() + 12_500);
      });
      const result = await env.service.refreshServiceToken({
        serviceId: SERVICE_ID,
        projectId: PROJECT_ID,
        destination: DESTINATION,
        rejectedTokenHash: hashAccessToken("old-access")
      });
      expect(result.credential.value).toBe("old-access");
      expect(env.tokenRequests).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("any other failure records lastError and keeps the service connected", async () => {
    env.onToken(() => json(503, { error: "temporarily_unavailable" }));
    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });
    expect(result.status).toBe(AgentVaultOauthStatus.Connected);
    expect(config().lastError).toBe(
      "The login server 'mcp.linear.app' refused the token request: temporarily_unavailable"
    );
    expect(config().lastError).not.toContain("old-");
  });

  test("an error code jsonb can't hold (NUL, a lone surrogate) is normalized before it is stored", async () => {
    env.onToken(() => json(400, { error: "server\u0000_error\ud800" }));
    await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });
    expect(config().lastError).toBe("The login server 'mcp.linear.app' refused the token request: server _error");
  });

  test("an expires_in too large for a date is stored as no expiry instead of throwing", async () => {
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 1e20 }));
    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });
    expect(result.credential).toMatchObject({ value: "new-access", expiresAt: null });
    expect(config().expiresAt).toBeNull();
  });

  test("comma-joined granted scopes are split only as a recorded fallback", async () => {
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", scope: "read,write" }));
    await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });
    expect(config().grantedScopes).toEqual(["read", "write"]);
    expect(config().compatibility).toEqual([AgentVaultOauthCompatibility.ScopeCommaSeparated]);
  });

  test("required scopes from a 403 mark it as needing them, with no refresh", async () => {
    await env.service.reportMissingScopes({
      serviceId: SERVICE_ID,
      hostPattern: DESTINATION.hostPattern,
      rejectedTokenHash: hashAccessToken("old-access"),
      requiredScopes: ["admin"]
    });
    expect(config().status).toBe(AgentVaultOauthStatus.NeedsAdditionalScopes);
    expect(config().requiredScopes).toEqual(["admin"]);
    expect(openBytes<TAgentVaultOauthSecret>(row().encryptedCredential!).accessToken).toBe("old-access");
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("required scopes for a token that was already replaced change nothing", async () => {
    await env.service.reportMissingScopes({
      serviceId: SERVICE_ID,
      hostPattern: DESTINATION.hostPattern,
      rejectedTokenHash: hashAccessToken("older-access"),
      requiredScopes: ["admin"]
    });
    expect(config().status).toBe(AgentVaultOauthStatus.Connected);
    expect(config().requiredScopes).toEqual([]);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("required scopes never override needs reauthorization", async () => {
    row().credentialConfig = oauthConfig({
      status: AgentVaultOauthStatus.NeedsReauthorization,
      lastError: "revoked"
    });
    await env.service.reportMissingScopes({
      serviceId: SERVICE_ID,
      hostPattern: DESTINATION.hostPattern,
      rejectedTokenHash: hashAccessToken("old-access"),
      requiredScopes: ["admin"]
    });
    expect(config().status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect(config().requiredScopes).toEqual([]);
  });

  test("a refresh opens the stored credential once and builds one project cipher", async () => {
    const createCipher = vi.spyOn(env.kms, "createCipherPairWithDataKey");
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 }));
    await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });
    expect(createCipher).toHaveBeenCalledTimes(1);
    expect(env.decrypts()).toBe(1);
  });

  test("lazy: a token valid past the horizon isn't refreshed, one expiring inside it is", async () => {
    await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      expiresWithinSeconds: 120
    });
    expect(env.tokenRequests).toHaveLength(0);

    row().credentialConfig = oauthConfig({ expiresAt: new Date(Date.now() + 30_000).toISOString() });
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", refresh_token: "rt-2" }));
    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      expiresWithinSeconds: 120
    });
    expect(result.credential.value).toBe("new-access");
    expect(result.credential.expiresAt).toBeNull();
    expect(openBytes<TAgentVaultOauthSecret>(row().encryptedCredential!).refreshToken).toBe("rt-2");
  });

  test("a service that moved to another host is a 409, with no provider call and no token", async () => {
    row().hostPattern = "mcp.other.example";
    row().config = { serverUrl: "https://mcp.other.example/mcp", transport: "streamable-http" };
    const result = env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: { hostPattern: "mcp.linear.app" },
      rejectedTokenHash: hashAccessToken("old-access")
    });
    await expect(result).rejects.toThrow(ConflictError);
    await expect(result).rejects.not.toThrow(/mcp\.other|mcp\.linear|\/mcp/);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("a move that lands while the provider answers is a 409, though the refreshed tokens are stored", async () => {
    env.onToken(() => {
      row().hostPattern = "mcp.other.example";
      return json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 });
    });
    await expect(
      env.service.refreshServiceToken({
        serviceId: SERVICE_ID,
        projectId: PROJECT_ID,
        destination: { hostPattern: "mcp.linear.app" },
        rejectedTokenHash: hashAccessToken("old-access")
      })
    ).rejects.toThrow(ConflictError);
    expect(openBytes<TAgentVaultOauthSecret>(row().encryptedCredential!).accessToken).toBe("new-access");
  });

  test("a reauthorization for another server mid-refresh is a 409, never the new server's token", async () => {
    env.onToken(() => {
      row().encryptedCredential = sealBytes({ accessToken: "other-server-access", refreshToken: "rt-other" });
      row().hostPattern = "mcp.other.example";
      return json(200, { access_token: "stale-refresh-access", token_type: "Bearer", expires_in: 600 });
    });
    await expect(
      env.service.refreshServiceToken({
        serviceId: SERVICE_ID,
        projectId: PROJECT_ID,
        destination: { hostPattern: "mcp.linear.app" },
        rejectedTokenHash: hashAccessToken("old-access")
      })
    ).rejects.toThrow(ConflictError);
  });

  test("resolve's destination also pins the server URL, so a path change on the same host is a 409", async () => {
    row().config = { serverUrl: "https://mcp.linear.app/v2/mcp", transport: "streamable-http" };
    await expect(
      env.service.refreshServiceToken({
        serviceId: SERVICE_ID,
        projectId: PROJECT_ID,
        destination: DESTINATION,
        expiresWithinSeconds: 7200
      })
    ).rejects.toThrow(ConflictError);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("a scope report that lands mid-refresh keeps its warning after the refresh writes", async () => {
    env.onToken(() => {
      // The report changes only the config, so the refresh's compare on the sealed credential still passes.
      row().credentialConfig = {
        ...config(),
        status: AgentVaultOauthStatus.NeedsAdditionalScopes,
        requiredScopes: ["admin"]
      };
      return json(200, { access_token: "new-access", token_type: "Bearer", refresh_token: "rt-2", expires_in: 600 });
    });
    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access")
    });

    expect(result.status).toBe(AgentVaultOauthStatus.NeedsAdditionalScopes);
    expect(result.credential.value).toBe("new-access");
    expect(config()).toMatchObject({
      status: AgentVaultOauthStatus.NeedsAdditionalScopes,
      requiredScopes: ["admin"],
      accessTokenHash: hashAccessToken("new-access")
    });
    expect(openBytes<TAgentVaultOauthSecret>(row().encryptedCredential!).refreshToken).toBe("rt-2");
  });

  test("two scope reports for the same token at once both end up required", async () => {
    const report = (scopes: string[]) =>
      env.service.reportMissingScopes({
        serviceId: SERVICE_ID,
        hostPattern: DESTINATION.hostPattern,
        rejectedTokenHash: hashAccessToken("old-access"),
        requiredScopes: scopes
      });
    await Promise.all([report(["admin"]), report(["write", "admin"])]);

    expect(config().status).toBe(AgentVaultOauthStatus.NeedsAdditionalScopes);
    expect([...config().requiredScopes].sort()).toEqual(["admin", "write"]);
  });

  test("a scope report keeps the scopes already required, without duplicates", async () => {
    row().credentialConfig = oauthConfig({
      status: AgentVaultOauthStatus.NeedsAdditionalScopes,
      requiredScopes: ["admin"]
    });
    await env.service.reportMissingScopes({
      serviceId: SERVICE_ID,
      hostPattern: DESTINATION.hostPattern,
      rejectedTokenHash: hashAccessToken("old-access"),
      requiredScopes: ["write", "admin", "write"]
    });
    expect(config().requiredScopes).toEqual(["admin", "write"]);
  });

  test("a scope report skips scopes already granted, and changes nothing when only those are named", async () => {
    await env.service.reportMissingScopes({
      serviceId: SERVICE_ID,
      hostPattern: DESTINATION.hostPattern,
      rejectedTokenHash: hashAccessToken("old-access"),
      requiredScopes: ["read"]
    });
    expect(config().status).toBe(AgentVaultOauthStatus.Connected);
    expect(config().requiredScopes).toEqual([]);

    await env.service.reportMissingScopes({
      serviceId: SERVICE_ID,
      hostPattern: DESTINATION.hostPattern,
      rejectedTokenHash: hashAccessToken("old-access"),
      requiredScopes: ["read", "admin"]
    });
    expect(config().status).toBe(AgentVaultOauthStatus.NeedsAdditionalScopes);
    expect(config().requiredScopes).toEqual(["admin"]);
  });

  test("required scopes stop growing at the cap", async () => {
    const report = (prefix: string) =>
      env.service.reportMissingScopes({
        serviceId: SERVICE_ID,
        hostPattern: DESTINATION.hostPattern,
        rejectedTokenHash: hashAccessToken("old-access"),
        requiredScopes: Array.from({ length: 50 }, (_, index) => `${prefix}:${index}`)
      });
    const reports = MAX_OAUTH_SCOPES / 50 + 1;
    for (let i = 0; i < reports; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await report(`r${i}`);
    }
    expect(config().requiredScopes).toHaveLength(MAX_OAUTH_SCOPES);
    expect(config().requiredScopes).not.toContain(`r${reports - 1}:0`);
  });

  test("a scope report for a service that moved is a 409 and changes nothing", async () => {
    await expect(
      env.service.reportMissingScopes({
        serviceId: SERVICE_ID,
        hostPattern: "old.example.com",
        rejectedTokenHash: hashAccessToken("old-access"),
        requiredScopes: ["admin"]
      })
    ).rejects.toThrow(AGENT_VAULT_SERVICE_MOVED_MESSAGE);
    expect(config().requiredScopes).toEqual([]);
  });

  test("a reauthorization needed after the report's read still isn't overridden by it", async () => {
    const liveRow = env.rows.get(SERVICE_ID)!;
    const result = env.service.reportMissingScopes({
      serviceId: SERVICE_ID,
      hostPattern: DESTINATION.hostPattern,
      rejectedTokenHash: hashAccessToken("old-access"),
      requiredScopes: ["admin"]
    });
    liveRow.credentialConfig = oauthConfig({
      status: AgentVaultOauthStatus.NeedsReauthorization,
      lastError: "revoked"
    });
    await result;
    expect(config().status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect(config().requiredScopes).toEqual([]);
  });
});

describe("building a credential from an authorization", () => {
  const record = (grantedScopes: string[]) =>
    ({
      issuer: "https://mcp.linear.app",
      authorizationEndpoint: "https://mcp.linear.app/authorize",
      tokenEndpoint: "https://mcp.linear.app/token",
      resource: SERVER_URL,
      clientId: "registered-client",
      registration: AgentVaultOauthRegistration.Dynamic,
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None,
      compatibility: [],
      requestedScopes: ["read", "write", "admin"],
      grantedScopes,
      expiresAt: null,
      accessTokenHash: hashAccessToken("at-1"),
      sealedCredential: sealBytes({ accessToken: "at-1" }).toString("base64")
    }) as unknown as TAgentVaultOauthAuthorization;
  const build = (grantedScopes: string[], previousRequiredScopes?: string[]) =>
    setup().service.buildCredentialFromAuthorization(record(grantedScopes), { previousRequiredScopes }).config;

  test("a required scope the provider didn't grant keeps the service needing it", () => {
    expect(build(["read", "write"], ["admin", "write"])).toMatchObject({
      status: AgentVaultOauthStatus.NeedsAdditionalScopes,
      requiredScopes: ["admin"]
    });
  });

  test("records the server URL the tokens were authorized for", () => {
    const { config } = setup().service.buildCredentialFromAuthorization({
      ...record(["read"]),
      serverUrl: SERVER_URL
    } as TAgentVaultOauthAuthorization);
    expect(config.serverUrl).toBe(SERVER_URL);
  });

  test("once every required scope is granted it is connected, with nothing left required", () => {
    expect(build(["read", "admin"], ["admin"])).toMatchObject({
      status: AgentVaultOauthStatus.Connected,
      requiredScopes: []
    });
    expect(build(["read"])).toMatchObject({ status: AgentVaultOauthStatus.Connected, requiredScopes: [] });
  });
});

describe("a reauthorization checked under the bundle lock", () => {
  const authorizedAt = "2026-10-15T10:00:00.000Z";
  const ISSUER = "https://mcp.linear.app";

  test("a service moved to another server since the claim refuses the save, naming hosts only", () => {
    const check = () =>
      checkOauthClaimUnderLock({
        authorizedServerUrl: "https://mcp.linear.app/mcp?k=secret",
        authorizedIssuer: ISSUER,
        lockedServerUrl: "https://mcp.other.example/path/key",
        readOauth: { authorizedAt },
        lockedOauth: { authorizedAt, issuer: ISSUER, requiredScopes: [] }
      });
    expect(check).toThrow(BadRequestError);
    expect(check).toThrow(
      "This authorization is for 'mcp.linear.app', but the service's server is 'mcp.other.example'. Authorize again for the new URL."
    );
  });

  test("a newer reauthorization since the first read is kept, with a 409", () => {
    expect(() =>
      checkOauthClaimUnderLock({
        authorizedServerUrl: SERVER_URL,
        authorizedIssuer: ISSUER,
        lockedServerUrl: SERVER_URL,
        readOauth: { authorizedAt },
        lockedOauth: { authorizedAt: "2026-10-15T10:05:00.000Z", issuer: ISSUER, requiredScopes: [] }
      })
    ).toThrow(ConflictError);
  });

  test("a refresh since the first read doesn't block it, and scopes reported meanwhile carry over", () => {
    expect(
      checkOauthClaimUnderLock({
        authorizedServerUrl: SERVER_URL,
        authorizedIssuer: ISSUER,
        lockedServerUrl: SERVER_URL,
        readOauth: { authorizedAt },
        lockedOauth: { authorizedAt, issuer: ISSUER, requiredScopes: ["admin"] }
      })
    ).toEqual(["admin"]);
    expect(
      checkOauthClaimUnderLock({
        authorizedServerUrl: SERVER_URL,
        authorizedIssuer: ISSUER,
        lockedServerUrl: SERVER_URL,
        readOauth: undefined,
        lockedOauth: undefined
      })
    ).toEqual([]);
  });

  test("scopes reported against another issuer are not carried over", () => {
    expect(
      checkOauthClaimUnderLock({
        authorizedServerUrl: SERVER_URL,
        authorizedIssuer: "https://auth.other.example",
        lockedServerUrl: SERVER_URL,
        readOauth: { authorizedAt },
        lockedOauth: { authorizedAt, issuer: ISSUER, requiredScopes: ["admin"] }
      })
    ).toEqual([]);
  });
});

describe("an edit that keeps a service's OAuth tokens, checked under the bundle lock", () => {
  const OTHER_SERVER_URL = "https://mcp.other.example/mcp/key";

  test("an edit resending the old URL after a reauthorization for another server is a 409, naming hosts only", () => {
    const check = () =>
      checkOauthServerUnderLock({
        requestedServerUrl: SERVER_URL,
        readServerUrl: SERVER_URL,
        effectiveServerUrl: SERVER_URL,
        lockedOauth: { serverUrl: OTHER_SERVER_URL }
      });
    expect(check).toThrow(ConflictError);
    expect(check).toThrow(
      "This service was reauthorized for 'mcp.other.example' while this save was in progress, so its server can't be set back to 'mcp.linear.app'. Reload the service and save again."
    );
  });

  test("a path change on the same host is a 409 that doesn't print either path", () => {
    const check = () =>
      checkOauthServerUnderLock({
        requestedServerUrl: SERVER_URL,
        readServerUrl: SERVER_URL,
        effectiveServerUrl: SERVER_URL,
        lockedOauth: { serverUrl: "https://mcp.linear.app/v2/secret-path" }
      });
    expect(check).toThrow(ConflictError);
    expect(check).not.toThrow(/secret-path|\/mcp/);
  });

  test("a request that changes the URL itself without a new authorization is a 400", () => {
    expect(() =>
      checkOauthServerUnderLock({
        requestedServerUrl: OTHER_SERVER_URL,
        readServerUrl: SERVER_URL,
        effectiveServerUrl: OTHER_SERVER_URL,
        lockedOauth: { serverUrl: SERVER_URL }
      })
    ).toThrow(BadRequestError);
  });

  test("a URL that still matches the server the tokens are for passes", () => {
    expect(() =>
      checkOauthServerUnderLock({
        requestedServerUrl: SERVER_URL,
        readServerUrl: SERVER_URL,
        effectiveServerUrl: SERVER_URL,
        lockedOauth: { serverUrl: SERVER_URL }
      })
    ).not.toThrow();
    expect(() =>
      checkOauthServerUnderLock({
        requestedServerUrl: undefined,
        readServerUrl: SERVER_URL,
        effectiveServerUrl: SERVER_URL,
        lockedOauth: { serverUrl: SERVER_URL }
      })
    ).not.toThrow();
  });
});

describe("a member's own sign-in", () => {
  const memberService = (overrides: Partial<TRow> = {}): TRow => ({
    id: SERVICE_ID,
    name: "linear",
    type: AgentVaultServiceType.Mcp,
    credentialType: AgentVaultCredentialType.OAuth,
    credentialConfig: {
      type: AgentVaultCredentialType.OAuth,
      serverUrl: SERVER_URL,
      issuer: "https://mcp.linear.app",
      registration: AgentVaultOauthRegistration.Dynamic,
      clientId: null
    },
    encryptedCredential: null,
    memberProvidedFields: ["credential-value"],
    hostPattern: "mcp.linear.app",
    config: { serverUrl: SERVER_URL, transport: "streamable-http" },
    ...overrides
  });

  const startPersonal = (env: ReturnType<typeof setup>, userId = USER_ID) =>
    env.service.createAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(userId),
      serverUrl: SERVER_URL,
      serviceId: SERVICE_ID,
      personal: true
    });

  test("a member reaches the service only through a bundle they hold", async () => {
    const OTHER_BUNDLE_ID = "33333333-3333-4333-8333-333333333333";
    const granted = setup({ canEditBundles: false, isAdmin: false });
    granted.rows.set(SERVICE_ID, memberService());
    const { authorization } = await startPersonal(granted);
    expect(storedAuthorization(granted, authorization!.id)).toMatchObject({ personal: true, serviceId: SERVICE_ID });

    const elsewhere = setup({ canEditBundles: false, isAdmin: false, grantedBundleIds: [OTHER_BUNDLE_ID] });
    elsewhere.rows.set(SERVICE_ID, memberService());
    await expect(startPersonal(elsewhere)).rejects.toThrow(`Service with ID '${SERVICE_ID}' not found`);
    expect(elsewhere.registrations).toHaveLength(0);
  });

  test("a member who can only read the bundle starts one, registering a client of their own", async () => {
    const env = setup({ canEditBundles: false });
    env.rows.set(SERVICE_ID, memberService());

    const { authorization } = await startPersonal(env);

    expect(storedAuthorization(env, authorization!.id)).toMatchObject({
      personal: true,
      serviceId: SERVICE_ID,
      clientId: "registered-client",
      registration: AgentVaultOauthRegistration.Dynamic
    });
    expect(env.registrations).toHaveLength(1);
  });

  test("every member signs in with the admin-entered client and its sealed secret", async () => {
    const env = setup({ canEditBundles: false });
    env.rows.set(
      SERVICE_ID,
      memberService({
        credentialConfig: {
          type: AgentVaultCredentialType.OAuth,
          serverUrl: SERVER_URL,
          issuer: "https://mcp.linear.app",
          registration: AgentVaultOauthRegistration.Manual,
          clientId: "admin-app"
        },
        encryptedCredential: sealBytes({ clientSecret: "admin-secret" })
      })
    );

    const { authorization } = await startPersonal(env);
    const record = storedAuthorization(env, authorization!.id);

    expect(record).toMatchObject({ clientId: "admin-app", registration: AgentVaultOauthRegistration.Manual });
    expect(openBytes<{ clientSecret?: string }>(Buffer.from(record.sealedPending, "base64")).clientSecret).toBe(
      "admin-secret"
    );
    expect(env.registrations).toHaveLength(0);
  });

  test("a service that keeps one shared sign-in has nothing for a member to connect", async () => {
    const env = setup({ canEditBundles: false });
    env.rows.set(
      SERVICE_ID,
      memberService({
        credentialConfig: oauthConfig(),
        encryptedCredential: sealBytes({ accessToken: "old-access" }),
        memberProvidedFields: null
      })
    );

    await expect(startPersonal(env)).rejects.toThrow(BadRequestError);
  });

  test("a member without Edit can't start one for the service itself", async () => {
    const env = setup({ canEditBundles: false });
    env.rows.set(SERVICE_ID, memberService());

    await expect(createAuthorization(env, { serviceId: SERVICE_ID })).rejects.toThrow(ForbiddenError);
  });

  test("a personal sign-in is claimed only as a personal value, and an admin's only for the service", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, memberService());
    const claimDto = { projectId: PROJECT_ID, serviceId: SERVICE_ID, serverUrl: SERVER_URL };

    const { authorization } = await startPersonal(env);
    await expect(
      env.service.claimAuthorization({ ...claimDto, authorizationId: authorization!.id, ctx: ctxOf(USER_ID) })
    ).rejects.toThrow(BadRequestError);

    const adminAuthorizationId = await authorize(env);
    await expect(
      env.service.claimAuthorization({
        ...claimDto,
        serviceId: undefined,
        authorizationId: adminAuthorizationId,
        ctx: ctxOf(USER_ID),
        personal: true
      })
    ).rejects.toThrow(BadRequestError);
  });

  test("loading the tools reads a sign-in of either intent without claiming it, but only for its own service", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, memberService());
    const readDto = { projectId: PROJECT_ID, serverUrl: SERVER_URL, ctx: ctxOf(USER_ID) };

    const { authorization } = await startPersonal(env);
    const state = new URL(authorization!.authorizeUrl).searchParams.get("state")!;
    await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state,
      code: "code-1",
      iss: "https://mcp.linear.app"
    });
    const personalDto = { ...readDto, authorizationId: authorization!.id, serviceId: SERVICE_ID };

    await expect(env.service.readAuthorizationAccessToken(personalDto)).resolves.toBe("at-1");
    await expect(env.service.readAuthorizationAccessToken({ ...personalDto, serviceId: undefined })).rejects.toThrow(
      BadRequestError
    );
    await expect(
      env.service.readAuthorizationAccessToken({ ...personalDto, ctx: ctxOf(OTHER_USER_ID) })
    ).rejects.toThrow();
    // Still unclaimed, so the member can save it as their own connection afterwards.
    await expect(env.service.claimAuthorization({ ...personalDto, personal: true })).resolves.toBeDefined();

    const adminAuthorizationId = await authorize(env);
    await expect(
      env.service.readAuthorizationAccessToken({ ...readDto, authorizationId: adminAuthorizationId })
    ).resolves.toBe("at-1");
  });

  test("a refresh for one member writes only that member's connection, and a dead login names their account", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, memberService());
    const connection = (userId: string, accessToken: string): TPersonalRow => ({
      id: crypto.randomUUID(),
      serviceId: SERVICE_ID,
      userId,
      encryptedValue: sealBytes({ accessToken, refreshToken: `${accessToken}-refresh` }),
      oauthConfig: oauthConfig({ accessTokenHash: hashAccessToken(accessToken) })
    });
    const mine = connection(USER_ID, "mine-access");
    const theirs = connection(OTHER_USER_ID, "their-access");
    env.personalRows.set(mine.id, mine);
    env.personalRows.set(theirs.id, theirs);
    const theirsBefore = {
      ...theirs,
      encryptedValue: Buffer.from(theirs.encryptedValue),
      oauthConfig: structuredClone(theirs.oauthConfig)
    };

    env.onToken(() => json(200, { access_token: "mine-new", token_type: "Bearer", expires_in: 600 }));
    const refreshed = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      owner: { userId: USER_ID },
      rejectedTokenHash: hashAccessToken("mine-access"),
      destination: DESTINATION
    });

    expect(refreshed.credential.value).toBe("mine-new");
    expect(env.tokenRequests[0].get("refresh_token")).toBe("mine-access-refresh");
    expect(openBytes<TAgentVaultOauthSecret>(mine.encryptedValue).accessToken).toBe("mine-new");
    expect(theirs).toEqual(theirsBefore);

    env.onToken(() => json(400, { error: "invalid_grant" }));
    const dead = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      owner: { userId: USER_ID },
      rejectedTokenHash: hashAccessToken("mine-new"),
      destination: DESTINATION
    });

    expect(dead.status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect((mine.oauthConfig as TAgentVaultOauthConfig).lastError).toContain("Connect your account again");
    expect(theirs).toEqual(theirsBefore);
  });

  test("a member's rejected token with no refresh token asks the member, not the admin, to reconnect", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, memberService());
    const mine: TPersonalRow = {
      id: crypto.randomUUID(),
      serviceId: SERVICE_ID,
      userId: USER_ID,
      encryptedValue: sealBytes({ accessToken: "mine-access" }),
      oauthConfig: oauthConfig({ accessTokenHash: hashAccessToken("mine-access") })
    };
    env.personalRows.set(mine.id, mine);

    const result = await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      owner: { userId: USER_ID },
      rejectedTokenHash: hashAccessToken("mine-access"),
      destination: DESTINATION
    });

    expect(result.status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect((mine.oauthConfig as TAgentVaultOauthConfig).lastError).toBe(
      "The MCP server rejected the access token and issued no refresh token. Connect your account again."
    );
    expect(env.tokenRequests).toHaveLength(0);
  });

  const manualMemberService = (issuer = "https://mcp.linear.app") =>
    memberService({
      credentialConfig: {
        type: AgentVaultCredentialType.OAuth,
        serverUrl: SERVER_URL,
        issuer,
        registration: AgentVaultOauthRegistration.Manual,
        clientId: "admin-app"
      },
      encryptedCredential: sealBytes({ clientSecret: "admin-secret" })
    });

  const memberConnection = (accessToken: string, overrides: Partial<TAgentVaultOauthConfig> = {}): TPersonalRow => ({
    id: crypto.randomUUID(),
    serviceId: SERVICE_ID,
    userId: USER_ID,
    encryptedValue: sealBytes({ accessToken, refreshToken: `${accessToken}-refresh` }),
    oauthConfig: oauthConfig({ accessTokenHash: hashAccessToken(accessToken), ...overrides })
  });

  test("is only for the service's own server URL", async () => {
    const env = setup({ canEditBundles: false });
    env.rows.set(SERVICE_ID, memberService());

    await expect(
      env.service.createAuthorization({
        projectId: PROJECT_ID,
        ctx: ctxOf(USER_ID),
        serverUrl: "https://mcp.linear.app/other",
        serviceId: SERVICE_ID,
        personal: true
      })
    ).rejects.toThrow(BadRequestError);
  });

  test("records the service setup it started under, so a save after an admin changed it is refused", async () => {
    const env = setup({ canEditBundles: false });
    const row = memberService();
    env.rows.set(SERVICE_ID, row);

    const { authorization } = await startPersonal(env);

    expect(storedAuthorization(env, authorization!.id).memberSetup).toBe(memberOauthSetupOf(row));
  });

  test("never sends the admin-entered client's secret to an issuer other than the one it was set up with", async () => {
    const env = setup({ canEditBundles: false });
    env.rows.set(SERVICE_ID, manualMemberService("https://old-issuer.example.com"));

    await expect(startPersonal(env)).rejects.toThrow(/different issuer/);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("an admin reauthorizing the service never reuses the members' client as a shared sign-in's", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, manualMemberService());

    await createAuthorization(env, { serviceId: SERVICE_ID });

    expect(env.registrations).toHaveLength(1);
  });

  test("the members' client secret on the service row is never refreshed as the service's own tokens", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, manualMemberService());

    await expect(
      env.service.refreshServiceToken({
        serviceId: SERVICE_ID,
        projectId: PROJECT_ID,
        rejectedTokenHash: hashAccessToken("anything"),
        destination: DESTINATION
      })
    ).rejects.toThrow(NotFoundError);
  });

  test("a member's refresh locks only that member's connection", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, memberService());
    const mine = memberConnection("mine-access");
    env.personalRows.set(mine.id, mine);

    await env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      owner: { userId: USER_ID },
      rejectedTokenHash: hashAccessToken("mine-access"),
      destination: DESTINATION
    });

    expect(env.lockKeys).toEqual([[KeyStorePrefixes.AgentVaultOauthPersonalRefreshLock(SERVICE_ID, USER_ID)]]);
  });

  test("missing scopes reported for a member's token mark that member's connection", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, memberService());
    const mine = memberConnection("mine-access");
    env.personalRows.set(mine.id, mine);

    await env.service.reportMissingScopes({
      serviceId: SERVICE_ID,
      owner: { userId: USER_ID },
      rejectedTokenHash: hashAccessToken("mine-access"),
      requiredScopes: ["write"],
      hostPattern: "mcp.linear.app"
    });

    expect(mine.oauthConfig).toMatchObject({
      status: AgentVaultOauthStatus.NeedsAdditionalScopes,
      requiredScopes: ["write"]
    });
  });

  test("a refused admin-entered app asks for an admin, while a refused registered client asks the member to reconnect", async () => {
    const env = setup();
    env.onToken(() => json(401, { error: "invalid_client" }));
    const refuse = async (registration: AgentVaultOauthRegistration) => {
      env.personalRows.clear();
      const mine = memberConnection("mine-access", { registration });
      env.personalRows.set(mine.id, mine);
      await env.service.refreshServiceToken({
        serviceId: SERVICE_ID,
        projectId: PROJECT_ID,
        owner: { userId: USER_ID },
        rejectedTokenHash: hashAccessToken("mine-access"),
        destination: DESTINATION
      });
      return (mine.oauthConfig as TAgentVaultOauthConfig).lastError;
    };

    env.rows.set(SERVICE_ID, manualMemberService());
    expect(await refuse(AgentVaultOauthRegistration.Manual)).toContain(
      "Ask a project admin to update the OAuth app on the service."
    );
    env.rows.set(SERVICE_ID, memberService());
    expect(await refuse(AgentVaultOauthRegistration.Dynamic)).toContain("Connect your account again");
  });

  test("a member with no connection gets a 404 rather than the service's or anyone else's token", async () => {
    const env = setup();
    env.rows.set(SERVICE_ID, memberService());

    await expect(
      env.service.refreshServiceToken({
        serviceId: SERVICE_ID,
        projectId: PROJECT_ID,
        owner: { userId: USER_ID },
        rejectedTokenHash: hashAccessToken("anything"),
        destination: DESTINATION
      })
    ).rejects.toThrow(NotFoundError);
    // Without an owner, a service whose members sign in has no tokens of its own.
    await expect(
      env.service.refreshServiceToken({
        serviceId: SERVICE_ID,
        projectId: PROJECT_ID,
        rejectedTokenHash: hashAccessToken("anything"),
        destination: DESTINATION
      })
    ).rejects.toThrow(NotFoundError);
  });
});

describe("setting up a service whose members sign in", () => {
  test("a server that registers clients needs nothing from the admin", async () => {
    const env = setup();
    expect(await env.service.prepareMemberOauth({ serverUrl: SERVER_URL })).toEqual({
      config: {
        type: AgentVaultCredentialType.OAuth,
        serverUrl: SERVER_URL,
        issuer: "https://mcp.linear.app",
        registration: AgentVaultOauthRegistration.Dynamic,
        clientId: null
      },
      clientSecret: undefined
    });
    expect(env.registrations).toHaveLength(0);
  });

  test("a server without registration needs the admin's own client", async () => {
    const env = setup({
      metadata: {
        ...LINEAR_JSON,
        "https://mcp.linear.app/.well-known/oauth-authorization-server": {
          ...(LINEAR_JSON["https://mcp.linear.app/.well-known/oauth-authorization-server"] as object),
          registration_endpoint: undefined
        }
      }
    });

    const refusal = env.service.prepareMemberOauth({ serverUrl: SERVER_URL });
    await expect(refusal).rejects.toThrow(/doesn't support automatic client registration/);
    await expect(refusal).rejects.toMatchObject({ details: { registrationRequired: true } });
    expect(
      (await env.service.prepareMemberOauth({ serverUrl: SERVER_URL, clientId: "admin-app", clientSecret: "s" })).config
    ).toMatchObject({ registration: AgentVaultOauthRegistration.Manual, clientId: "admin-app" });
  });

  test("a guessed registration endpoint is tried at save, and one that refuses asks for the admin's own client", async () => {
    const env = setup({ metadata: {}, challenge: `Bearer realm="mcp"` });
    env.onRegister(() => json(404, {}));

    const refusal = env.service.prepareMemberOauth({ serverUrl: SERVER_URL });
    await expect(refusal).rejects.toMatchObject({ details: { registrationRequired: true } });
    expect(env.registrations).not.toHaveLength(0);
  });

  test("a server that doesn't advertise OAuth asks for the admin's own client", async () => {
    const env = setup({ metadata: {}, challenge: null });

    const refusal = env.service.prepareMemberOauth({ serverUrl: SERVER_URL });
    await expect(refusal).rejects.toThrow(/doesn't advertise OAuth/);
    await expect(refusal).rejects.toMatchObject({ details: { registrationRequired: true } });
  });
});

const VARIABLE_ID = "66666666-6666-4666-8666-666666666666";
const OTHER_VARIABLE_ID = "77777777-7777-4777-8777-777777777777";
const IDENTITY_ID = "88888888-8888-4888-8888-888888888888";
const API_REDIRECT_URI = "https://app.acme.test/oauth/callback";
const AUTHORIZATION_KEY = (id: string) => `agent-vault-oauth-authorization:${id}`;

const identityCtx = {
  actor: ActorType.IDENTITY,
  actorId: IDENTITY_ID,
  actorOrgId: "org-1",
  actorAuthMethod: null
};

const addVariable = (
  env: ReturnType<typeof setup>,
  input: TAgentVaultOauthVariableSettingsInput,
  overrides: Partial<TVariableRow> = {}
) => {
  const row: TVariableRow = {
    id: VARIABLE_ID,
    projectId: PROJECT_ID,
    key: "LINEAR_U123",
    type: AgentVaultVariableType.OAuth,
    userId: null,
    identityId: null,
    encryptedValue: null,
    oauthConfig: { settings: toOauthVariableSettings(input), connection: null },
    ...overrides
  };
  env.variableRows.set(row.id, row);
  return row;
};

const startVariableSignIn = (
  env: ReturnType<typeof setup>,
  ctx: typeof identityCtx | ReturnType<typeof ctxOf> = identityCtx,
  extra: { clientSecret?: string; variableId?: string } = {}
) => env.service.startVariableAuthorization({ projectId: PROJECT_ID, ctx, variableId: VARIABLE_ID, ...extra });

const stateOf = (authorizeUrl: string) => new URL(authorizeUrl).searchParams.get("state")!;

const completeVariableSignIn = (
  env: ReturnType<typeof setup>,
  state: string,
  {
    ctx = identityCtx,
    variableId = VARIABLE_ID,
    ...rest
  }: {
    ctx?: typeof identityCtx | ReturnType<typeof ctxOf>;
    variableId?: string;
    code?: string;
    error?: string;
    iss?: string;
  } = {}
) =>
  env.service.completeVariableAuthorization({
    projectId: PROJECT_ID,
    ctx,
    variableId,
    state,
    ...("error" in rest ? {} : { code: "code-1", iss: "https://mcp.linear.app" }),
    ...rest
  });

describe("starting an OAuth variable's sign-in", () => {
  test("a machine identity gets a link to the variable's own callback, registered under the project's name", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });

    const start = await startVariableSignIn(env);

    expect(start).toMatchObject({
      registrationRequired: false,
      manualSetupRequired: false,
      prefill: null,
      redirectUri: API_REDIRECT_URI
    });
    const url = new URL(start.authorization!.authorizeUrl);
    expect(url.searchParams.get("redirect_uri")).toBe(API_REDIRECT_URI);
    expect(env.registrations[0]).toMatchObject({ client_name: "Acme Support", redirect_uris: [API_REDIRECT_URI] });
    expect(new Date(start.authorization!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const record = storedAuthorization(env, start.authorization!.id);
    expect(record).toMatchObject({
      variableId: VARIABLE_ID,
      serviceId: null,
      actor: { type: ActorType.IDENTITY, id: IDENTITY_ID },
      redirectUri: API_REDIRECT_URI
    });
    expect(record).not.toHaveProperty("clientName");
    expect(record.actorUserId).toBeUndefined();
    expect(record.variableSettingsFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the variable's client name is sent at registration, and Infisical's callback when it has no redirect URI", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, clientName: "Acme Helpdesk" });

    const start = await startVariableSignIn(env, ctxOf(USER_ID));

    expect(start.redirectUri).toBe(REDIRECT_URI);
    expect(env.registrations[0]).toMatchObject({ client_name: "Acme Helpdesk", redirect_uris: [REDIRECT_URI] });
  });

  test("endpoints discovery only guessed get no registration and no link, only a prefill", async () => {
    const env = setup({ metadata: {}, challenge: null });
    addVariable(env, { serverUrl: SERVER_URL });

    const start = await startVariableSignIn(env, ctxOf(USER_ID));

    expect(start).toEqual({
      authorization: null,
      registrationRequired: false,
      manualSetupRequired: true,
      prefill: {
        authorizationEndpoint: "https://mcp.linear.app/authorize",
        tokenEndpoint: "https://mcp.linear.app/token",
        issuer: "https://mcp.linear.app",
        scopes: []
      },
      redirectUri: REDIRECT_URI
    });
    expect(env.registrations).toHaveLength(0);
    expect([...env.store.keys()]).toEqual([]);
  });

  test("metadata naming another issuer gets no registration and no link, only a prefill", async () => {
    const env = setup({
      metadata: {
        ...LINEAR_JSON,
        "https://mcp.linear.app/.well-known/oauth-authorization-server": {
          ...(LINEAR_JSON["https://mcp.linear.app/.well-known/oauth-authorization-server"] as object),
          issuer: "https://linear.app"
        }
      }
    });
    addVariable(env, { serverUrl: SERVER_URL });

    const start = await startVariableSignIn(env, ctxOf(USER_ID));

    expect(start.authorization).toBeNull();
    expect(start.manualSetupRequired).toBe(true);
    expect(start.prefill).toEqual({
      authorizationEndpoint: "https://mcp.linear.app/authorize",
      tokenEndpoint: "https://mcp.linear.app/token",
      issuer: "https://linear.app",
      scopes: ["read", "write"]
    });
    expect(env.registrations).toHaveLength(0);
  });

  test("a service's own sign-in still refuses metadata naming another issuer", async () => {
    const env = setup({
      metadata: {
        ...LINEAR_JSON,
        "https://mcp.linear.app/.well-known/oauth-authorization-server": {
          ...(LINEAR_JSON["https://mcp.linear.app/.well-known/oauth-authorization-server"] as object),
          issuer: "https://linear.app"
        }
      }
    });
    await expect(createAuthorization(env)).rejects.toThrow(/different issuer/);
  });

  test("a discovered server that lists no scopes is signed in to without a scope parameter, as a service is", async () => {
    const withoutScopes = {
      ...LINEAR_JSON,
      "https://mcp.linear.app/.well-known/oauth-protected-resource/mcp": {
        resource: SERVER_URL,
        authorization_servers: ["https://mcp.linear.app"]
      }
    };
    const env = setup({ metadata: withoutScopes });
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const unscoped = await startVariableSignIn(env);
    expect(new URL(unscoped.authorization!.authorizeUrl).searchParams.has("scope")).toBe(false);
    expect(storedAuthorization(env, unscoped.authorization!.id).requestedScopes).toEqual([]);

    const scoped = setup({ metadata: withoutScopes });
    addVariable(scoped, { serverUrl: SERVER_URL, scopes: ["issues:read"], redirectUri: API_REDIRECT_URI });
    const start = await startVariableSignIn(scoped);
    expect(new URL(start.authorization!.authorizeUrl).searchParams.get("scope")).toBe("issues:read");
  });

  test("a variable set up by hand still needs a scope, since there is no metadata to read them from", async () => {
    const env = setup();
    addVariable(env, {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      clientId: "google-client",
      redirectUri: API_REDIRECT_URI
    });

    await expect(startVariableSignIn(env)).rejects.toMatchObject({
      name: "BadRequest",
      details: { field: "oauth.scopes" }
    });
    expect([...env.store.keys()]).toEqual([]);
  });

  test("without the variable's scopes, a sign-in asks for no more than a service's would, not the server's whole list", async () => {
    const advertised = {
      ...LINEAR_JSON,
      "https://mcp.linear.app/.well-known/oauth-protected-resource/mcp": {
        resource: SERVER_URL,
        authorization_servers: ["https://mcp.linear.app"]
      },
      "https://mcp.linear.app/.well-known/oauth-authorization-server": {
        ...(LINEAR_JSON["https://mcp.linear.app/.well-known/oauth-authorization-server"] as object),
        scopes_supported: ["read", "has space", "offline_access"]
      }
    };
    const env = setup({ metadata: advertised });
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });

    const start = await startVariableSignIn(env);

    expect(new URL(start.authorization!.authorizeUrl).searchParams.get("scope")).toBe("offline_access");

    const service = setup({ metadata: advertised });
    const { authorization } = await createAuthorization(service);
    expect(new URL(authorization!.authorizeUrl).searchParams.get("scope")).toBe("offline_access");
  });

  test("a variable's own scopes skip the advertised list, so a provider listing too many still signs in", async () => {
    const env = setup({
      metadata: {
        ...LINEAR_JSON,
        "https://mcp.linear.app/.well-known/oauth-protected-resource/mcp": {
          resource: SERVER_URL,
          authorization_servers: ["https://mcp.linear.app"]
        },
        "https://mcp.linear.app/.well-known/oauth-authorization-server": {
          ...(LINEAR_JSON["https://mcp.linear.app/.well-known/oauth-authorization-server"] as object),
          scopes_supported: Array.from({ length: 250 }, (_, i) => `scope${i}`)
        }
      }
    });
    addVariable(env, { serverUrl: SERVER_URL, scopes: ["openid"], redirectUri: API_REDIRECT_URI });

    const start = await startVariableSignIn(env);

    expect(new URL(start.authorization!.authorizeUrl).searchParams.get("scope")).toBe("openid");
  });

  test("a variable discovers an issuer under its server URL's path (Keycloak)", async () => {
    const realm = "https://sso.example.com/realms/acme";
    const env = setup({
      challenge: null,
      metadata: {
        [`${realm}/.well-known/openid-configuration`]: {
          issuer: realm,
          authorization_endpoint: `${realm}/protocol/openid-connect/auth`,
          token_endpoint: `${realm}/protocol/openid-connect/token`,
          registration_endpoint: `${realm}/clients-registrations/openid-connect`,
          scopes_supported: ["openid", "profile"],
          code_challenge_methods_supported: ["S256"]
        }
      }
    });
    addVariable(env, { serverUrl: realm, redirectUri: API_REDIRECT_URI });

    const start = await startVariableSignIn(env);

    expect(start.manualSetupRequired).toBe(false);
    const url = new URL(start.authorization!.authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${realm}/protocol/openid-connect/auth`);
    expect(url.searchParams.get("scope")).toBeNull();
  });

  test("a variable set up by hand discovers nothing, and a reconnect keeps the stored client secret", async () => {
    const env = setup();
    addVariable(
      env,
      {
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        clientId: "google-client",
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
        redirectUri: API_REDIRECT_URI
      },
      { encryptedValue: sealBytes({ accessToken: "old-access", clientSecret: "stored-secret" }) }
    );

    const start = await startVariableSignIn(env);

    const url = new URL(start.authorization!.authorizeUrl);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(env.registrations).toHaveLength(0);
    const record = storedAuthorization(env, start.authorization!.id);
    expect(record).toMatchObject({
      issuer: "https://accounts.google.com",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      clientId: "google-client",
      registration: AgentVaultOauthRegistration.Manual,
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic
    });
    expect(openBytes<{ clientSecret?: string }>(Buffer.from(record.sealedPending, "base64")).clientSecret).toBe(
      "stored-secret"
    );
  });

  test("a client secret sent for an app whose method is none is refused, not dropped", async () => {
    const env = setup();
    addVariable(env, {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      clientId: "public-client",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None,
      scopes: ["openid"],
      redirectUri: API_REDIRECT_URI
    });

    await expect(startVariableSignIn(env, identityCtx, { clientSecret: "typed-secret" })).rejects.toThrow(
      /'tokenEndpointAuthMethod' is 'none'/
    );
    const start = await startVariableSignIn(env);
    expect(start.authorization).not.toBeNull();
  });

  test("a variable set up by hand with no issuer checks only the origin of an iss, and one with an issuer checks it all", async () => {
    const env = setup();
    const manual = {
      authorizationEndpoint: "https://sso.example.com/realms/acme/protocol/openid-connect/auth",
      tokenEndpoint: "https://sso.example.com/realms/acme/protocol/openid-connect/token",
      clientId: "acme-client",
      scopes: ["openid"],
      redirectUri: API_REDIRECT_URI
    };
    addVariable(env, manual);

    const pathIssuer = await startVariableSignIn(env);
    expect(storedAuthorization(env, pathIssuer.authorization!.id)).toMatchObject({
      issuer: "https://sso.example.com",
      issuerOriginOnly: true
    });
    const connected = await completeVariableSignIn(env, stateOf(pathIssuer.authorization!.authorizeUrl), {
      code: "code-1",
      iss: "https://sso.example.com/realms/acme"
    });
    expect(connected.variableConnected).not.toBeNull();

    const foreign = await startVariableSignIn(env);
    await expect(
      completeVariableSignIn(env, stateOf(foreign.authorization!.authorizeUrl), {
        code: "code-2",
        iss: "https://attacker.example.net/realms/acme"
      })
    ).rejects.toThrow(
      "The authorization response came from a different server than 'sso.example.com' uses, so it was rejected. If the provider's issuer is on another domain, enter it under Issuer."
    );
    expect(env.tokenRequests).toHaveLength(1);

    const noIss = await startVariableSignIn(env);
    await expect(
      completeVariableSignIn(env, stateOf(noIss.authorization!.authorizeUrl), { code: "code-3", iss: undefined })
    ).resolves.toMatchObject({ variableConnected: { variableId: VARIABLE_ID } });

    const row = env.variableRows.get(VARIABLE_ID)!;
    row.oauthConfig = {
      ...row.oauthConfig!,
      settings: toOauthVariableSettings({ ...manual, issuer: "https://sso.example.com/realms/acme" })
    };
    const explicit = await startVariableSignIn(env);
    expect(storedAuthorization(env, explicit.authorization!.id)).not.toHaveProperty("issuerOriginOnly");
    await expect(
      completeVariableSignIn(env, stateOf(explicit.authorization!.authorizeUrl), {
        code: "code-4",
        iss: "https://sso.example.com/realms/other"
      })
    ).rejects.toThrow(/different server/);
  });

  test("a sign-in started before the rename, marked issuerUnchecked, still has its iss origin checked", async () => {
    const env = setup();
    addVariable(env, {
      authorizationEndpoint: "https://sso.example.com/realms/acme/protocol/openid-connect/auth",
      tokenEndpoint: "https://sso.example.com/realms/acme/protocol/openid-connect/token",
      clientId: "acme-client",
      scopes: ["openid"],
      redirectUri: API_REDIRECT_URI
    });
    const relabel = async () => {
      const { authorization } = await startVariableSignIn(env);
      const { issuerOriginOnly: _renamed, ...record } = storedAuthorization(env, authorization!.id);
      env.store.set(AUTHORIZATION_KEY(authorization!.id), JSON.stringify({ ...record, issuerUnchecked: true }));
      return stateOf(authorization!.authorizeUrl);
    };

    await expect(completeVariableSignIn(env, await relabel(), { iss: "https://attacker.example.net" })).rejects.toThrow(
      /different server/
    );
    await expect(
      completeVariableSignIn(env, await relabel(), { iss: "https://sso.example.com/realms/acme" })
    ).resolves.toMatchObject({ variableConnected: { variableId: VARIABLE_ID } });
  });

  test("a machine identity can't sign in a variable without its own redirect URI", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL });

    await expect(startVariableSignIn(env)).rejects.toMatchObject({
      name: "BadRequest",
      details: { field: "oauth.redirectUri" }
    });
    expect(env.registrations).toHaveLength(0);
  });

  test("a client secret for a variable that registers its client is refused", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL });
    await expect(startVariableSignIn(env, ctxOf(USER_ID), { clientSecret: "secret" })).rejects.toThrow(
      /takes no client secret/
    );
  });

  test("a caller who can edit variables but not read them is refused before any registration or link", async () => {
    const env = setup({ canReadVariables: false });
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });

    const refused = startVariableSignIn(env);
    await expect(refused).rejects.toThrow(ForbiddenRequestError);
    await expect(refused).rejects.toThrow(/read variables/);
    expect(env.registrations).toHaveLength(0);
    expect([...env.store.keys()]).toEqual([]);
  });

  test("a caller who can't edit variables gets a 404, and a text variable a 400", async () => {
    const env = setup({ canEditVariables: false });
    addVariable(env, { serverUrl: SERVER_URL });
    await expect(startVariableSignIn(env)).rejects.toThrow(NotFoundError);

    const text = setup();
    addVariable(text, { serverUrl: SERVER_URL }, { type: AgentVaultVariableType.Text, oauthConfig: null });
    await expect(startVariableSignIn(text)).rejects.toThrow(BadRequestError);
  });
});

describe("completing an OAuth variable's sign-in", () => {
  test("an identity's sign-in is written into the variable, and completing it again changes nothing", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    const state = stateOf(authorization!.authorizeUrl);

    const result = await completeVariableSignIn(env, state);

    expect(result.variableConnected).toEqual({
      variableId: VARIABLE_ID,
      key: "LINEAR_U123",
      method: AgentVaultOauthVariableConnectMethod.SignIn,
      issuer: "https://mcp.linear.app",
      scopes: ["read"]
    });
    expect(env.tokenRequests[0].get("redirect_uri")).toBe(API_REDIRECT_URI);
    const row = env.variableRows.get(VARIABLE_ID)!;
    expect(openBytes<TAgentVaultOauthSecret>(row.encryptedValue!)).toEqual({
      accessToken: "at-1",
      refreshToken: "rt-1"
    });
    expect(row.oauthConfig!.connection).toMatchObject({
      serverUrl: SERVER_URL,
      issuer: "https://mcp.linear.app",
      clientId: "registered-client",
      status: AgentVaultOauthStatus.Connected,
      accessTokenHash: hashAccessToken("at-1")
    });
    expect(row.oauthConfig!.settings.redirectUri).toBe(API_REDIRECT_URI);
    // The tokens live on the variable now, so the record keeps none.
    expect(storedAuthorization(env, authorization!.id)).toMatchObject({
      status: AgentVaultOauthAuthorizationStatus.Authorized,
      sealedCredential: null,
      sealedPending: ""
    });

    await expect(completeVariableSignIn(env, state)).resolves.toEqual({ variableConnected: null });
    expect(env.tokenRequests).toHaveLength(1);
  });

  test("a second sign-in replaces the tokens as a reconnect", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const first = await startVariableSignIn(env);
    await completeVariableSignIn(env, stateOf(first.authorization!.authorizeUrl));

    const second = await startVariableSignIn(env);
    const result = await completeVariableSignIn(env, stateOf(second.authorization!.authorizeUrl));

    expect(result.variableConnected?.method).toBe(AgentVaultOauthVariableConnectMethod.Reconnect);
  });

  test("a sign-in started for another variable is a 400, and the code is never used", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    addVariable(env, { serverUrl: SERVER_URL }, { id: OTHER_VARIABLE_ID, key: "LINEAR_U456" });
    const { authorization } = await startVariableSignIn(env);

    await expect(
      completeVariableSignIn(env, stateOf(authorization!.authorizeUrl), { variableId: OTHER_VARIABLE_ID })
    ).rejects.toThrow(/started for a different variable/);
    expect(env.tokenRequests).toHaveLength(0);
    expect(env.variableRows.get(OTHER_VARIABLE_ID)!.encryptedValue).toBeNull();
  });

  test("a service's authorization can't complete a variable", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL });
    const { authorization } = await createAuthorization(env);

    await expect(
      completeVariableSignIn(env, stateOf(authorization!.authorizeUrl), { ctx: ctxOf(USER_ID) })
    ).rejects.toThrow(/started for a service/);
  });

  test("anyone but the actor who started it, or a state that names nothing, gets a 404", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    const state = stateOf(authorization!.authorizeUrl);

    await expect(completeVariableSignIn(env, state, { ctx: ctxOf(USER_ID) })).rejects.toThrow(NotFoundError);
    await expect(
      completeVariableSignIn(env, state, { ctx: { ...identityCtx, actorId: "99999999-9999-4999-8999-999999999999" } })
    ).rejects.toThrow(NotFoundError);
    await expect(completeVariableSignIn(env, "not-a-sign-in.abc")).rejects.toThrow(NotFoundError);
    await expect(completeVariableSignIn(env, `${authorization!.id}.forged`)).rejects.toThrow(BadRequestError);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("settings changed since the sign-in started are a 409, and the tokens are never written", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    const row = env.variableRows.get(VARIABLE_ID)!;
    row.oauthConfig = { ...row.oauthConfig!, settings: toOauthVariableSettings({ serverUrl: `${SERVER_URL}/v2` }) };
    const state = stateOf(authorization!.authorizeUrl);

    await expect(completeVariableSignIn(env, state)).rejects.toThrow(AGENT_VAULT_OAUTH_VARIABLE_CHANGED_MESSAGE);
    expect(row.encryptedValue).toBeNull();
    expect(row.oauthConfig!.connection).toBeNull();
    // The code is spent, so the sign-in stays failed, with the same status.
    const repeated = completeVariableSignIn(env, state);
    await expect(repeated).rejects.toThrow(ConflictError);
    await expect(repeated).rejects.toThrow(AGENT_VAULT_OAUTH_VARIABLE_CHANGED_MESSAGE);
    expect(env.tokenRequests).toHaveLength(1);
  });

  test("a disconnect after the sign-in started cancels it, and a later sign-in keeps the count", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization: stale } = await startVariableSignIn(env);
    const row = env.variableRows.get(VARIABLE_ID)!;
    row.oauthConfig = { ...row.oauthConfig!, disconnects: 1 };

    await expect(completeVariableSignIn(env, stateOf(stale!.authorizeUrl))).rejects.toThrow(
      AGENT_VAULT_OAUTH_VARIABLE_CHANGED_MESSAGE
    );
    expect(row.oauthConfig!.connection).toBeNull();

    const { authorization: fresh } = await startVariableSignIn(env);
    await completeVariableSignIn(env, stateOf(fresh!.authorizeUrl));
    expect(row.oauthConfig!.connection).not.toBeNull();
    expect(row.oauthConfig!.disconnects).toBe(1);
  });

  test("a failed sign-in recorded before its status was kept is repeated as a 400", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    const record = storedAuthorization(env, authorization!.id);
    env.store.set(
      AUTHORIZATION_KEY(authorization!.id),
      JSON.stringify({ ...record, status: AgentVaultOauthAuthorizationStatus.Failed, error: "It failed." })
    );

    await expect(completeVariableSignIn(env, stateOf(authorization!.authorizeUrl))).rejects.toThrow(BadRequestError);
  });

  test("a scope change since the sign-in started doesn't block it", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    const row = env.variableRows.get(VARIABLE_ID)!;
    row.oauthConfig = {
      ...row.oauthConfig!,
      settings: toOauthVariableSettings({ serverUrl: SERVER_URL, scopes: ["read"], redirectUri: API_REDIRECT_URI })
    };

    const result = await completeVariableSignIn(env, stateOf(authorization!.authorizeUrl));
    expect(result.variableConnected).not.toBeNull();
  });

  test("an actor who can no longer edit variables is refused, and nothing is written", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    env.permissions.canEditVariables = false;

    await expect(completeVariableSignIn(env, stateOf(authorization!.authorizeUrl))).rejects.toThrow(
      ForbiddenRequestError
    );
    expect(env.variableRows.get(VARIABLE_ID)!.encryptedValue).toBeNull();
  });

  test("an actor who can no longer read variables is refused, nothing is written, and a repeat is still a 403", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    env.permissions.canReadVariables = false;
    const state = stateOf(authorization!.authorizeUrl);

    const refused = completeVariableSignIn(env, state);
    await expect(refused).rejects.toThrow(ForbiddenRequestError);
    await expect(refused).rejects.toThrow(/no longer read variables/);
    expect(env.variableRows.get(VARIABLE_ID)!.encryptedValue).toBeNull();
    await expect(completeVariableSignIn(env, state)).rejects.toThrow(ForbiddenRequestError);
  });

  test("the provider's refusal is a 400 with its reason", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);

    await expect(
      completeVariableSignIn(env, stateOf(authorization!.authorizeUrl), {
        error: "access_denied",
        iss: "https://mcp.linear.app"
      })
    ).rejects.toThrow(/was denied/);
    expect(storedAuthorization(env, authorization!.id).status).toBe(AgentVaultOauthAuthorizationStatus.Failed);
  });

  test("a write that fails after the code was redeemed keeps the tokens, so a retry writes them without a new exchange", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    const state = stateOf(authorization!.authorizeUrl);
    env.failNextVariableWrite(new Error("connection reset"));

    await expect(completeVariableSignIn(env, state)).rejects.toThrow("connection reset");
    expect(env.variableRows.get(VARIABLE_ID)!.encryptedValue).toBeNull();
    const kept = storedAuthorization(env, authorization!.id);
    expect(kept.status).toBe(AgentVaultOauthAuthorizationStatus.Authorized);
    expect(kept.sealedCredential).not.toBeNull();
    await expect(
      env.service.getAuthorization({ projectId: PROJECT_ID, ctx: identityCtx, authorizationId: authorization!.id })
    ).resolves.toMatchObject({ authorization: { status: AgentVaultOauthAuthorizationStatus.Pending } });

    const retried = await completeVariableSignIn(env, state);

    expect(retried.variableConnected?.method).toBe(AgentVaultOauthVariableConnectMethod.SignIn);
    expect(env.tokenRequests).toHaveLength(1);
    expect(openBytes<TAgentVaultOauthSecret>(env.variableRows.get(VARIABLE_ID)!.encryptedValue!)).toEqual({
      accessToken: "at-1",
      refreshToken: "rt-1"
    });
    expect(storedAuthorization(env, authorization!.id).sealedCredential).toBeNull();
  });

  test("a record save that fails after the variable was written is retried without redeeming the code again", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    const state = stateOf(authorization!.authorizeUrl);
    let saves = 0;
    env.onSetItem((key) => {
      if (key !== AUTHORIZATION_KEY(authorization!.id)) return;
      saves += 1;
      // The first save keeps the redeemed tokens; the second marks the record done.
      if (saves === 2) throw new Error("OOM command not allowed");
    });

    await expect(completeVariableSignIn(env, state)).rejects.toThrow("OOM command not allowed");
    expect(env.variableRows.get(VARIABLE_ID)!.encryptedValue).not.toBeNull();

    const retried = await completeVariableSignIn(env, state);

    expect(retried.variableConnected).not.toBeNull();
    expect(env.tokenRequests).toHaveLength(1);
    expect(storedAuthorization(env, authorization!.id)).toMatchObject({
      status: AgentVaultOauthAuthorizationStatus.Authorized,
      sealedCredential: null
    });
  });

  test("a retry of a sign-in already written leaves tokens a refresh replaced since", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    const state = stateOf(authorization!.authorizeUrl);
    let saves = 0;
    env.onSetItem((key) => {
      if (key !== AUTHORIZATION_KEY(authorization!.id)) return;
      saves += 1;
      if (saves === 2) throw new Error("OOM command not allowed");
    });
    await expect(completeVariableSignIn(env, state)).rejects.toThrow("OOM command not allowed");
    const row = env.variableRows.get(VARIABLE_ID)!;
    expect(row.oauthConfig!.connection!.authorizationId).toBe(authorization!.id);

    const refreshed = Buffer.from("refreshed-tokens");
    row.encryptedValue = refreshed;
    row.oauthConfig = {
      ...row.oauthConfig!,
      connection: {
        ...row.oauthConfig!.connection!,
        accessTokenHash: "refreshed",
        authorizationMethod: AgentVaultOauthVariableConnectMethod.Reconnect
      }
    };

    const retried = await completeVariableSignIn(env, state);

    // The method comes from what the first write stored, not a guess.
    expect(retried.variableConnected).toMatchObject({ method: AgentVaultOauthVariableConnectMethod.Reconnect });
    expect(row.encryptedValue).toBe(refreshed);
    expect(row.oauthConfig!.connection!.accessTokenHash).toBe("refreshed");
    expect(env.tokenRequests).toHaveLength(1);
  });

  test("the dashboard's callback retries a failed record save without redeeming the code again", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL });
    const { authorization } = await startVariableSignIn(env, ctxOf(USER_ID));
    const complete = () =>
      env.service.completeAuthorization({
        projectId: PROJECT_ID,
        ctx: ctxOf(USER_ID),
        authorizationId: authorization!.id,
        state: stateOf(authorization!.authorizeUrl),
        code: "code-1",
        iss: "https://mcp.linear.app"
      });
    let saves = 0;
    env.onSetItem((key) => {
      if (key !== AUTHORIZATION_KEY(authorization!.id)) return;
      saves += 1;
      if (saves === 2) throw new Error("OOM command not allowed");
    });

    await expect(complete()).rejects.toThrow("OOM command not allowed");

    const retried = await complete();

    expect(retried.authorization.status).toBe(AgentVaultOauthAuthorizationStatus.Authorized);
    expect(retried.variableConnected).toBeDefined();
    expect(env.tokenRequests).toHaveLength(1);
  });

  test("the dashboard's callback keeps an unwritten sign-in's tokens too, and its retry writes them", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL });
    const { authorization } = await startVariableSignIn(env, ctxOf(USER_ID));
    const complete = () =>
      env.service.completeAuthorization({
        projectId: PROJECT_ID,
        ctx: ctxOf(USER_ID),
        authorizationId: authorization!.id,
        state: stateOf(authorization!.authorizeUrl),
        code: "code-1",
        iss: "https://mcp.linear.app"
      });
    env.failNextVariableWrite(new Error("connection reset"));

    await expect(complete()).rejects.toThrow("connection reset");
    expect(storedAuthorization(env, authorization!.id).sealedCredential).not.toBeNull();

    const retried = await complete();

    expect(retried.authorization.status).toBe(AgentVaultOauthAuthorizationStatus.Authorized);
    expect(retried.variableConnected?.method).toBe(AgentVaultOauthVariableConnectMethod.SignIn);
    expect(env.tokenRequests).toHaveLength(1);
    expect(env.variableRows.get(VARIABLE_ID)!.encryptedValue).not.toBeNull();
  });

  test("a sign-in already being completed is a 409", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL, redirectUri: API_REDIRECT_URI });
    const { authorization } = await startVariableSignIn(env);
    env.store.set(`${AUTHORIZATION_KEY(authorization!.id)}:complete`, "1");

    await expect(completeVariableSignIn(env, stateOf(authorization!.authorizeUrl))).rejects.toThrow(ConflictError);
  });

  test("the dashboard's callback writes the sign-in into the variable, and a service save can't claim it", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL });
    const { authorization } = await startVariableSignIn(env, ctxOf(USER_ID));

    const result = await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state: stateOf(authorization!.authorizeUrl),
      code: "code-1",
      iss: "https://mcp.linear.app"
    });

    expect(result.authorization.status).toBe(AgentVaultOauthAuthorizationStatus.Authorized);
    expect(result.variableConnected?.method).toBe(AgentVaultOauthVariableConnectMethod.SignIn);
    expect(env.variableRows.get(VARIABLE_ID)!.encryptedValue).not.toBeNull();
    await expect(
      env.service.claimAuthorization({
        authorizationId: authorization!.id,
        projectId: PROJECT_ID,
        ctx: ctxOf(USER_ID),
        serverUrl: SERVER_URL
      })
    ).rejects.toThrow(/signs in an OAuth variable/);
  });

  test("the dashboard's callback reports a variable that changed as a failed authorization, with a 200", async () => {
    const env = setup();
    addVariable(env, { serverUrl: SERVER_URL });
    const { authorization } = await startVariableSignIn(env, ctxOf(USER_ID));
    const row = env.variableRows.get(VARIABLE_ID)!;
    row.oauthConfig = { ...row.oauthConfig!, settings: toOauthVariableSettings({ serverUrl: `${SERVER_URL}/v2` }) };

    const result = await env.service.completeAuthorization({
      projectId: PROJECT_ID,
      ctx: ctxOf(USER_ID),
      authorizationId: authorization!.id,
      state: stateOf(authorization!.authorizeUrl),
      code: "code-1",
      iss: "https://mcp.linear.app"
    });

    expect(result.authorization).toMatchObject({
      status: AgentVaultOauthAuthorizationStatus.Failed,
      error: AGENT_VAULT_OAUTH_VARIABLE_CHANGED_MESSAGE
    });
    expect(result.variableConnected).toBeUndefined();
    expect(row.encryptedValue).toBeNull();
    expect(storedAuthorization(env, authorization!.id).sealedCredential).toBeNull();
  });

  test("a record from before identities could sign in is read as its user's", async () => {
    const env = setup();
    const { authorization } = await createAuthorization(env);
    const record = storedAuthorization(env, authorization!.id);
    delete record.actor;
    env.store.set(AUTHORIZATION_KEY(authorization!.id), JSON.stringify(record));

    await expect(
      env.service.getAuthorization({ projectId: PROJECT_ID, ctx: ctxOf(USER_ID), authorizationId: authorization!.id })
    ).resolves.toMatchObject({ authorization: { id: authorization!.id } });
    await expect(
      env.service.getAuthorization({
        projectId: PROJECT_ID,
        ctx: { ...identityCtx, actorId: USER_ID },
        authorizationId: authorization!.id
      })
    ).rejects.toThrow(NotFoundError);
  });
});

describe("refreshing a token held by an OAuth variable", () => {
  let env: ReturnType<typeof setup>;
  const variable = () => env.variableRows.get(VARIABLE_ID)!;
  const connection = () => variable().oauthConfig!.connection!;
  const refresh = (extra: Partial<Parameters<typeof env.service.refreshServiceToken>[0]> = {}) =>
    env.service.refreshServiceToken({
      serviceId: SERVICE_ID,
      projectId: PROJECT_ID,
      variableId: VARIABLE_ID,
      destination: DESTINATION,
      rejectedTokenHash: hashAccessToken("old-access"),
      ...extra
    });

  beforeEach(() => {
    env = setup();
    env.rows.set(SERVICE_ID, {
      id: SERVICE_ID,
      name: "linear",
      type: AgentVaultServiceType.Mcp,
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: VARIABLE_ID },
      encryptedCredential: null,
      hostPattern: "mcp.linear.app",
      config: { serverUrl: SERVER_URL, transport: "streamable-http" }
    });
    (env.rows.get(SERVICE_ID) as TRow & { projectId: string }).projectId = PROJECT_ID;
    addVariable(
      env,
      { serverUrl: SERVER_URL },
      {
        encryptedValue: sealBytes({ accessToken: "old-access", refreshToken: "old-refresh" }),
        oauthConfig: {
          settings: toOauthVariableSettings({ serverUrl: SERVER_URL }),
          connection: oauthConfig()
        }
      }
    );
  });

  test("writes the new tokens into the variable, under one lock for the variable", async () => {
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 }));

    const result = await refresh();

    expect(result.credential.value).toBe("new-access");
    expect(env.lockKeys).toEqual([[`agent-vault-oauth-refresh-lock:variable:${VARIABLE_ID}`]]);
    expect(openBytes<TAgentVaultOauthSecret>(variable().encryptedValue!)).toEqual({
      accessToken: "new-access",
      refreshToken: "old-refresh"
    });
    expect(connection().accessTokenHash).toBe(hashAccessToken("new-access"));
    expect(variable().oauthConfig!.settings.serverUrl).toBe(SERVER_URL);
  });

  test("a dead login names the variable to sign in again, without naming a page an API variable hides", async () => {
    env.onToken(() => json(400, { error: "invalid_grant" }));

    const result = await refresh();

    expect(result.status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect(connection().lastError).toMatch(/^LINEAR_U123's sign-in is no longer accepted \(.+\)\. Sign it in again\.$/);
  });

  test("a rejected token with no refresh token says the server rejected it, not an MCP server", async () => {
    variable().encryptedValue = sealBytes({ accessToken: "old-access" });

    await refresh();

    expect(connection().lastError).toBe(
      "The server rejected the access token and issued no refresh token. Sign LINEAR_U123 in again."
    );
  });

  test("a service that now uses another variable is a 409, with no provider call", async () => {
    env.rows.get(SERVICE_ID)!.credentialConfig = {
      type: AgentVaultCredentialType.OAuth,
      source: "variable",
      variableId: OTHER_VARIABLE_ID
    };

    await expect(refresh()).rejects.toThrow(AGENT_VAULT_SERVICE_VARIABLE_CHANGED_MESSAGE);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("a service that moved to another host is a 409, with no provider call", async () => {
    env.rows.get(SERVICE_ID)!.hostPattern = "mcp.example.com";

    await expect(refresh()).rejects.toThrow(AGENT_VAULT_SERVICE_MOVED_MESSAGE);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("a deleted service is a 409, so resolve tries the next service using the variable", async () => {
    env.rows.delete(SERVICE_ID);

    const refused = refresh();
    await expect(refused).rejects.toThrow(ConflictError);
    await expect(refused).rejects.toThrow(AGENT_VAULT_SERVICE_MOVED_MESSAGE);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("a deleted variable is still a 404", async () => {
    env.variableRows.delete(VARIABLE_ID);

    await expect(refresh()).rejects.toThrow(NotFoundError);
  });

  test("a refused OAuth app of the caller's own asks for its new client secret", async () => {
    Object.assign(connection(), {
      registration: AgentVaultOauthRegistration.Manual,
      clientId: "acme-app",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic
    });
    env.onToken(() => json(401, { error: "invalid_client" }));

    const result = await refresh();

    expect(result.status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect(connection().lastError).toMatch(
      /^The provider refused LINEAR_U123's OAuth app \(.+\)\. Enter the app's new Client Secret, then sign it in again\.$/
    );
  });

  test("a refused registered client still asks for a new sign-in", async () => {
    env.onToken(() => json(401, { error: "invalid_client" }));

    await refresh();

    expect(connection().lastError).toMatch(/^LINEAR_U123's sign-in is no longer accepted \(.+\)\. Sign it in again\.$/);
  });

  test("a variable that isn't connected is a 404 that names it", async () => {
    Object.assign(variable(), {
      encryptedValue: null,
      oauthConfig: { ...variable().oauthConfig!, connection: null }
    });

    const refused = refresh();
    await expect(refused).rejects.toThrow(NotFoundError);
    await expect(refused).rejects.toThrow("LINEAR_U123 isn't signed in. Sign it in.");
  });

  test("a service that switched to another variable while the provider answered is told so, not that it moved", async () => {
    env.onToken(() => {
      env.rows.get(SERVICE_ID)!.credentialConfig = {
        type: AgentVaultCredentialType.OAuth,
        source: "variable",
        variableId: OTHER_VARIABLE_ID
      };
      return json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 });
    });

    await expect(refresh()).rejects.toThrow(AGENT_VAULT_SERVICE_VARIABLE_CHANGED_MESSAGE);
  });

  test("a failed refresh while the service switches to another variable records the failure and says so", async () => {
    env.onToken(() => {
      env.rows.get(SERVICE_ID)!.credentialConfig = {
        type: AgentVaultCredentialType.OAuth,
        source: "variable",
        variableId: OTHER_VARIABLE_ID
      };
      return json(400, { error: "invalid_grant" });
    });

    const refused = refresh();
    await expect(refused).rejects.toThrow(ConflictError);
    await expect(refused).rejects.toThrow(AGENT_VAULT_SERVICE_VARIABLE_CHANGED_MESSAGE);
    expect(connection().status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
  });

  test("a refresh with no service refreshes the variable on its own, under the variable's lock", async () => {
    env.rows.delete(SERVICE_ID);
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 }));

    const result = await env.service.refreshVariableToken({
      variableId: VARIABLE_ID,
      projectId: PROJECT_ID,
      rejectedTokenHash: hashAccessToken("old-access")
    });

    expect(result.credential.value).toBe("new-access");
    expect(env.lockKeys).toEqual([[`agent-vault-oauth-refresh-lock:variable:${VARIABLE_ID}`]]);
    expect(connection().accessTokenHash).toBe(hashAccessToken("new-access"));
  });

  test("a refresh with no service refreshes a token about to expire, and leaves a fresh one alone", async () => {
    const lazy = () =>
      env.service.refreshVariableToken({ variableId: VARIABLE_ID, projectId: PROJECT_ID, expiresWithinSeconds: 60 });
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 }));

    await expect(lazy()).resolves.toMatchObject({ credential: { value: "old-access" } });
    expect(env.tokenRequests).toHaveLength(0);

    connection().expiresAt = new Date(Date.now() + 10_000).toISOString();
    await expect(lazy()).resolves.toMatchObject({ credential: { value: "new-access" } });
  });

  test("a refresh with no service never marks the variable dead over a rejection alone", async () => {
    variable().encryptedValue = sealBytes({ accessToken: "old-access" });

    const result = await env.service.refreshVariableToken({
      variableId: VARIABLE_ID,
      projectId: PROJECT_ID,
      rejectedTokenHash: hashAccessToken("old-access")
    });

    expect(result).toMatchObject({ credential: { value: "old-access" }, status: AgentVaultOauthStatus.Connected });
    expect(connection().status).toBe(AgentVaultOauthStatus.Connected);
  });

  test("a refresh with no service can't reach a variable in another project", async () => {
    await expect(
      env.service.refreshVariableToken({ variableId: VARIABLE_ID, projectId: "other-project" })
    ).rejects.toThrow(NotFoundError);
  });

  test("required scopes are reported on the variable's sign-in", async () => {
    await env.service.reportMissingScopes({
      serviceId: SERVICE_ID,
      variableId: VARIABLE_ID,
      rejectedTokenHash: hashAccessToken("old-access"),
      requiredScopes: ["admin"],
      hostPattern: "mcp.linear.app"
    });

    expect(connection()).toMatchObject({
      status: AgentVaultOauthStatus.NeedsAdditionalScopes,
      requiredScopes: ["admin"]
    });
  });
});

describe("refreshing tokens sent with a session", () => {
  let env: ReturnType<typeof setup>;
  const INLINE_ID = "66666666-6666-4666-8666-666666666666";
  const inline = () => env.rows.get(INLINE_ID)!;
  const refresh = (extra: Partial<Parameters<typeof env.service.refreshServiceToken>[0]> = {}) =>
    env.service.refreshServiceToken({
      serviceId: INLINE_ID,
      projectId: PROJECT_ID,
      inline: true,
      destination: { hostPattern: "www.googleapis.com", serverUrl: null },
      rejectedTokenHash: hashAccessToken("old-access"),
      ...extra
    });

  beforeEach(() => {
    env = setup();
    env.rows.set(INLINE_ID, {
      id: INLINE_ID,
      name: "gdrive",
      type: AgentVaultServiceType.Http,
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: { ...oauthConfig(), serverUrl: null },
      encryptedCredential: sealBytes({ accessToken: "old-access", refreshToken: "old-refresh" }),
      hostPattern: "www.googleapis.com",
      config: {},
      sessionId: "session-1"
    });
  });

  test("writes the new tokens into the session's service, under its own lock", async () => {
    env.onToken(() => json(200, { access_token: "new-access", token_type: "Bearer", expires_in: 600 }));

    const result = await refresh();

    expect(result.credential.value).toBe("new-access");
    expect(env.lockKeys).toEqual([[`agent-vault-oauth-refresh-lock:${INLINE_ID}`]]);
    expect(openBytes<TAgentVaultOauthSecret>(inline().encryptedCredential!)).toEqual({
      accessToken: "new-access",
      refreshToken: "old-refresh"
    });
  });

  test("a dead login asks for a new session", async () => {
    env.onToken(() => json(400, { error: "invalid_grant" }));

    const result = await refresh();

    expect(result.status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
    expect((inline().credentialConfig as TAgentVaultOauthConfig).lastError).toMatch(
      /^The OAuth tokens sent with this session are no longer accepted \(.+\)\. Start a new session with new tokens\.$/
    );
  });

  test("tokens of a session that ended are a 404, with no provider call", async () => {
    inline().secretsDeletedAt = new Date();

    await expect(refresh()).rejects.toThrow(NotFoundError);
    expect(env.tokenRequests).toHaveLength(0);
  });

  test("a session's own service is never refreshed as a project's service", async () => {
    await expect(refresh({ inline: undefined })).rejects.toThrow(NotFoundError);
    expect(env.tokenRequests).toHaveLength(0);
  });
});
