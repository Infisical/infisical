import crypto from "node:crypto";

import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import {
  AgentVaultCredentialType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultOauthStatus,
  AgentVaultServiceType
} from "../agent-vault/agent-vault-enums";
import { MAX_OAUTH_SCOPES } from "./agent-vault-oauth-discovery-fns";
import { TOauthHttpClient, TOauthHttpResponse } from "./agent-vault-oauth-http-fns";
import {
  AGENT_VAULT_SERVICE_MOVED_MESSAGE,
  agentVaultOauthServiceFactory,
  checkOauthClaimUnderLock,
  checkOauthServerUnderLock
} from "./agent-vault-oauth-service";
import { hashAccessToken } from "./agent-vault-oauth-token-fns";
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
  accessBundleId: string;
  credentialType: string;
  credentialConfig: unknown;
  encryptedCredential: Buffer | null;
  hostPattern?: string;
  config?: unknown;
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
  canEditBundles = true
}: { metadata?: Record<string, unknown>; canEditBundles?: boolean } = {}) => {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const rows = new Map<string, TRow>();
  const tokenRequests: URLSearchParams[] = [];
  const registrations: unknown[] = [];
  let registerHandler: () => TOauthHttpResponse = () => json(201, { client_id: "registered-client" });
  let lockHandler: (settings: unknown) => Promise<void> = async () => {};
  let lockTail = Promise.resolve();
  let tokenHandler: (form: URLSearchParams) => TOauthHttpResponse = () =>
    json(200, { access_token: "at-1", token_type: "Bearer", refresh_token: "rt-1", expires_in: 3600, scope: "read" });

  const http: TOauthHttpClient = {
    probe: async () => ({
      status: 401,
      wwwAuthenticate: `Bearer resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp"`
    }),
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
      acquireLock: async (_keys: string[], _duration: number, settings?: unknown) => {
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
    kmsService: kms as never,
    agentVaultServiceDAL: {
      findByIdInAccessBundle: async ({ id }: { id: string }) => rows.get(id) as never,
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
    agentVaultAccessBundleDAL: {
      findByIdInProject: async ({ id }: { id: string }) => (id === BUNDLE_ID ? ({ id } as never) : undefined)
    },
    permissionService: {
      getProjectPermission: async () =>
        ({
          permission: createMongoAbility(
            canEditBundles
              ? [
                  {
                    action: ProjectPermissionAgentVaultAccessBundleActions.Edit,
                    subject: ProjectPermissionSub.AgentVaultAccessBundles
                  }
                ]
              : []
          ),
          hasRole: () => true,
          memberships: []
        }) as never
    },
    membershipDAL: { findResourceMembershipsForActor: async () => [] }
  });

  return {
    service,
    store,
    ttls,
    rows,
    tokenRequests,
    registrations,
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
    }
  };
};

const createAuthorization = (env: ReturnType<typeof setup>, extra: Record<string, string> = {}) =>
  env.service.createAuthorization({
    projectId: PROJECT_ID,
    ctx: ctxOf(USER_ID),
    accessBundleId: BUNDLE_ID,
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
      accessBundleId: BUNDLE_ID,
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
        accessBundleId: BUNDLE_ID,
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
      accessBundleId: BUNDLE_ID,
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

  test("an unknown bundle is a 404", async () => {
    const env = setup();
    await expect(
      env.service.createAuthorization({
        projectId: PROJECT_ID,
        ctx: ctxOf(USER_ID),
        accessBundleId: "99999999-9999-4999-8999-999999999999",
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
        accessBundleId: BUNDLE_ID,
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
    accessBundleId: BUNDLE_ID,
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
    await expect(
      env.service.claimAuthorization({
        ...claimArgs,
        authorizationId: id,
        accessBundleId: "99999999-9999-4999-8999-999999999999"
      })
    ).rejects.toThrow(/different access bundle/);
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
      env.service.claimAuthorization({
        ...claimArgs,
        authorizationId: id,
        accessBundleId: "99999999-9999-4999-8999-999999999999"
      })
    ).rejects.toThrow(/different access bundle/);
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
      accessBundleId: BUNDLE_ID,
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
      accessBundleId: BUNDLE_ID,
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
    await report("a");
    await report("b");
    await report("c");
    expect(config().requiredScopes).toHaveLength(MAX_OAUTH_SCOPES);
    expect(config().requiredScopes).not.toContain("c:0");
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
