import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import { hashAccessToken } from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import {
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthRegistration
} from "../agent-vault-oauth/agent-vault-oauth-types";
import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultOauthVariableConnectMethod,
  AgentVaultVariableScope,
  AgentVaultVariableType
} from "../agent-vault/agent-vault-enums";
import { oauthVariableSettingsFingerprintOf, toOauthVariableSettings } from "./agent-vault-oauth-variable-fns";
import { TAgentVaultVariable } from "./agent-vault-variable-dal";
import { agentVaultVariableServiceFactory } from "./agent-vault-variable-service";
import { TAgentVaultOauthVariableConfig, TAgentVaultOauthVariableConnection } from "./agent-vault-variable-types";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const PROJECT_ID = "project-1";
const OAUTH_ID = "11111111-1111-4111-8111-111111111111";
const TEXT_ID = "22222222-2222-4222-8222-222222222222";

type TService = ReturnType<typeof agentVaultVariableServiceFactory>;

const ctx = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorOrgId: "org-1",
  actorAuthMethod: null
} as unknown as Parameters<TService["createVariable"]>[0]["ctx"];

const settings = toOauthVariableSettings({
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  clientId: "client-1",
  scopes: ["https://www.googleapis.com/auth/drive.readonly"]
});

const connection = (accessTokenHash: string): TAgentVaultOauthVariableConnection => ({
  type: AgentVaultCredentialType.OAuth,
  grantType: OauthGrantType.AuthorizationCode,
  serverUrl: null,
  issuer: "https://accounts.google.com",
  authorizationEndpoint: settings.authorizationEndpoint!,
  tokenEndpoint: settings.tokenEndpoint!,
  resource: null,
  clientId: "client-1",
  registration: AgentVaultOauthRegistration.Manual,
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic,
  compatibility: [],
  requestedScopes: settings.scopes,
  grantedScopes: settings.scopes,
  requiredScopes: [],
  status: AgentVaultOauthStatus.Connected,
  expiresAt: null,
  accessTokenHash,
  authorizedAt: "2026-11-01T00:00:00.000Z",
  lastRefreshedAt: null,
  lastError: null
});

const oauthRow = (accessTokenHash = "hash-1"): TAgentVaultVariable => ({
  id: OAUTH_ID,
  projectId: PROJECT_ID,
  userId: null,
  identityId: null,
  key: "GDRIVE_U123",
  type: AgentVaultVariableType.OAuth,
  encryptedValue: Buffer.from(`sealed:${accessTokenHash}`),
  oauthConfig: { settings, connection: connection(accessTokenHash) } satisfies TAgentVaultOauthVariableConfig,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z")
});

const textRow = (): TAgentVaultVariable => ({
  id: TEXT_ID,
  projectId: PROJECT_ID,
  userId: null,
  identityId: null,
  key: "GITHUB_TOKEN",
  type: AgentVaultVariableType.Text,
  encryptedValue: Buffer.from(`sealed:${JSON.stringify({ value: "ghp_1" })}`),
  oauthConfig: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z")
});

// `locked` stands in for the row as the update's lock reads it, when another write committed after the first read.
const buildService = ({
  rows,
  locked,
  rules = [{ action: "manage", subject: "all" }]
}: {
  rows: TAgentVaultVariable[];
  locked?: TAgentVaultVariable;
  rules?: { action: string | string[]; subject: string }[];
}) => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const tx = { raw: vi.fn() };
  const agentVaultVariableDAL = {
    findByIdInProject: vi.fn(async ({ id }: { id: string }) => byId.get(id)),
    lockByIdInProject: vi.fn(async ({ id }: { id: string }) => (locked && locked.id === id ? locked : byId.get(id))),
    findByKey: vi.fn().mockResolvedValue(undefined),
    findKeys: vi.fn(async () => rows.map(({ id, key, type }) => ({ id, key, type }))),
    create: vi.fn(async (columns: Partial<TAgentVaultVariable>) => ({
      ...columns,
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: new Date(),
      updatedAt: new Date()
    })),
    updateById: vi.fn(async (id: string, columns: Partial<TAgentVaultVariable>) => {
      const updated = { ...(locked ?? byId.get(id))!, ...columns };
      byId.set(id, updated);
      return updated;
    }),
    findServicesUsing: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => fn(tx))
  };
  const agentVaultOauthService = {
    prepareVariableSignIn: vi.fn().mockResolvedValue({
      registrationRequired: false,
      manualSetupRequired: false,
      prefill: null,
      redirectUri: "https://app.acme.test/oauth/callback",
      prepared: {
        record: { id: "auth-1" },
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=auth-1.x"
      }
    }),
    saveVariableSignIn: vi.fn(async (prepared: { authorizeUrl: string }) => ({
      id: "auth-1",
      authorizeUrl: prepared.authorizeUrl,
      expiresAt: "2026-11-18T00:10:00.000Z"
    }))
  };
  const service = agentVaultVariableServiceFactory({
    agentVaultVariableDAL,
    agentVaultPersonalValueDAL: { delete: vi.fn() },
    membershipDAL: { findResourceMembershipsForActor: vi.fn().mockResolvedValue([]) },
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({
        permission: createMongoAbility(rules),
        hasRole: () => true,
        memberships: []
      })
    },
    kmsDataKeyService: {
      createCipherPairWithDataKey: vi.fn().mockResolvedValue({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({
          cipherTextBlob: Buffer.concat([Buffer.from("sealed:"), plainText])
        }),
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob.subarray("sealed:".length)
      })
    },
    agentVaultOauthService
  } as unknown as Parameters<typeof agentVaultVariableServiceFactory>[0]);
  return { service, agentVaultVariableDAL, agentVaultOauthService };
};

const writtenColumns = (dal: ReturnType<typeof buildService>["agentVaultVariableDAL"]) =>
  dal.updateById.mock.calls[0][1] as Partial<TAgentVaultVariable>;

describe("createVariable, OAuth", () => {
  test("stores the settings with no value, so the variable starts out not connected", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [] });

    const { variable } = await service.createVariable({
      projectId: PROJECT_ID,
      ctx,
      scope: AgentVaultVariableScope.Global,
      key: "GDRIVE_U123",
      type: AgentVaultVariableType.OAuth,
      oauth: {
        authorizationEndpoint: settings.authorizationEndpoint!,
        tokenEndpoint: settings.tokenEndpoint!,
        clientId: "client-1",
        scopes: settings.scopes
      }
    });

    const columns = agentVaultVariableDAL.create.mock.calls[0][0];
    expect(columns).toMatchObject({ type: AgentVaultVariableType.OAuth, encryptedValue: null });
    expect(columns.oauthConfig).toEqual({ settings, connection: null });
    expect(variable.type).toBe(AgentVaultVariableType.OAuth);
    expect(variable.oauth).toMatchObject({
      status: AgentVaultOauthStatus.NotConnected,
      registration: AgentVaultOauthRegistration.Manual,
      connection: null
    });
  });

  test("refuses a personal OAuth variable", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [] });

    await expect(
      service.createVariable({
        projectId: PROJECT_ID,
        ctx,
        scope: AgentVaultVariableScope.Personal,
        key: "GDRIVE_U123",
        type: AgentVaultVariableType.OAuth,
        oauth: { serverUrl: "https://mcp.example.com/mcp" }
      })
    ).rejects.toThrow(BadRequestError);
    expect(agentVaultVariableDAL.create).not.toHaveBeenCalled();
  });
});

describe("updateVariable, OAuth", () => {
  const update = (service: TService, fields: Partial<Parameters<TService["updateVariable"]>[0]>) =>
    service.updateVariable({ projectId: PROJECT_ID, ctx, variableId: OAUTH_ID, ...fields });

  test("refuses a value, since tokens only come from a sign-in or an import", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [oauthRow()] });

    await expect(update(service, { value: "pasted-token" })).rejects.toThrow("holds OAuth tokens");
    expect(agentVaultVariableDAL.updateById).not.toHaveBeenCalled();
  });

  test("a rename keeps the tokens", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [oauthRow()] });

    const result = await update(service, { key: "GDRIVE_RENAMED" });

    expect(writtenColumns(agentVaultVariableDAL)).toEqual({ key: "GDRIVE_RENAMED" });
    expect(result.valueReplaced).toBe(false);
    expect(result.variable.oauth?.status).toBe(AgentVaultOauthStatus.Connected);
  });

  test("a scope change keeps the tokens and writes no value", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [oauthRow()] });

    const result = await update(service, { oauth: { scopes: ["openid", "email"] } });

    const columns = writtenColumns(agentVaultVariableDAL);
    expect(columns).not.toHaveProperty("encryptedValue");
    expect((columns.oauthConfig as TAgentVaultOauthVariableConfig).settings.scopes).toEqual(["openid", "email"]);
    expect((columns.oauthConfig as TAgentVaultOauthVariableConfig).connection).not.toBeNull();
    expect(result.valueReplaced).toBe(false);
  });

  test("an edit that keeps the tokens writes the connection the locked row holds, not the first read's", async () => {
    const { service, agentVaultVariableDAL } = buildService({
      rows: [oauthRow("hash-before-refresh")],
      locked: oauthRow("hash-after-refresh")
    });

    await update(service, { oauth: { clientName: "Acme Assistant" } });

    const config = writtenColumns(agentVaultVariableDAL).oauthConfig as TAgentVaultOauthVariableConfig;
    expect(config.connection?.accessTokenHash).toBe("hash-after-refresh");
    expect(config.settings.clientName).toBe("Acme Assistant");
  });

  test("a sign-in setting change disconnects the variable", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [oauthRow()] });

    const result = await update(service, { oauth: { tokenEndpoint: "https://login.example.com/token" } });

    const columns = writtenColumns(agentVaultVariableDAL);
    expect(columns.encryptedValue).toBeNull();
    expect((columns.oauthConfig as TAgentVaultOauthVariableConfig).connection).toBeNull();
    expect(result.valueReplaced).toBe(true);
    expect(result.variable.oauth?.status).toBe(AgentVaultOauthStatus.NotConnected);
  });

  test("value null disconnects the variable", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [oauthRow()] });

    const result = await update(service, { value: null });

    const columns = writtenColumns(agentVaultVariableDAL);
    expect(columns.encryptedValue).toBeNull();
    expect((columns.oauthConfig as TAgentVaultOauthVariableConfig).settings).toEqual(settings);
    expect(result.valueReplaced).toBe(true);
  });

  test("value null counts a disconnect, so a sign-in started before it no longer matches", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [oauthRow()] });

    await update(service, { value: null });

    const config = writtenColumns(agentVaultVariableDAL).oauthConfig as TAgentVaultOauthVariableConfig;
    expect(config.disconnects).toBe(1);
    expect(oauthVariableSettingsFingerprintOf(config.settings, config.disconnects)).not.toBe(
      oauthVariableSettingsFingerprintOf(settings)
    );
  });

  test("a sign-in setting change counts a disconnect on top of the stored count", async () => {
    const row = oauthRow();
    const { service, agentVaultVariableDAL } = buildService({
      rows: [{ ...row, oauthConfig: { ...(row.oauthConfig as TAgentVaultOauthVariableConfig), disconnects: 2 } }]
    });

    await update(service, { oauth: { clientId: "client-2" } });

    expect((writtenColumns(agentVaultVariableDAL).oauthConfig as TAgentVaultOauthVariableConfig).disconnects).toBe(3);
  });

  test("an edit that keeps the tokens keeps the count", async () => {
    const row = oauthRow();
    const { service, agentVaultVariableDAL } = buildService({
      rows: [{ ...row, oauthConfig: { ...(row.oauthConfig as TAgentVaultOauthVariableConfig), disconnects: 2 } }]
    });

    await update(service, { oauth: { scopes: ["openid"] } });

    expect((writtenColumns(agentVaultVariableDAL).oauthConfig as TAgentVaultOauthVariableConfig).disconnects).toBe(2);
  });

  test("refuses settings that no longer hold together once merged with the stored ones", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [oauthRow()] });

    await expect(update(service, { oauth: { tokenEndpoint: null } })).rejects.toThrow(
      "Send both 'authorizationEndpoint' and 'tokenEndpoint'"
    );
    expect(agentVaultVariableDAL.updateById).not.toHaveBeenCalled();
  });
});

describe("updateVariable, text", () => {
  const update = (service: TService, fields: Partial<Parameters<TService["updateVariable"]>[0]>) =>
    service.updateVariable({ projectId: PROJECT_ID, ctx, variableId: TEXT_ID, ...fields });

  test("a new value is sealed as before", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [textRow()] });

    const result = await update(service, { value: "ghp_2" });

    const columns = writtenColumns(agentVaultVariableDAL);
    expect(columns.encryptedValue?.toString()).toBe(`sealed:${JSON.stringify({ value: "ghp_2" })}`);
    expect(columns).not.toHaveProperty("oauthConfig");
    expect(result.valueReplaced).toBe(true);
    expect(result.variable).toMatchObject({ type: AgentVaultVariableType.Text, oauth: null });
  });

  test("refuses OAuth settings and an empty value", async () => {
    const { service } = buildService({ rows: [textRow()] });

    await expect(update(service, { oauth: { scopes: ["repo"] } })).rejects.toThrow("is a text variable");
    await expect(update(service, { value: null })).rejects.toThrow("always has a value");
  });
});

describe("getVariableValue", () => {
  test("an OAuth variable's tokens are never returned", async () => {
    const { service } = buildService({ rows: [oauthRow()] });

    await expect(service.getVariableValue({ projectId: PROJECT_ID, ctx, variableId: OAUTH_ID })).rejects.toThrow(
      "its tokens can't be read"
    );
  });

  test("a text variable's value is returned", async () => {
    const { service } = buildService({ rows: [textRow()] });

    const { value } = await service.getVariableValue({ projectId: PROJECT_ID, ctx, variableId: TEXT_ID });

    expect(value).toBe("ghp_1");
  });
});

const opened = (blob: unknown) => JSON.parse((blob as Buffer).subarray("sealed:".length).toString("utf-8")) as unknown;

const manualOauth = {
  authorizationEndpoint: settings.authorizationEndpoint!,
  tokenEndpoint: settings.tokenEndpoint!,
  clientId: "client-1",
  scopes: settings.scopes
};

describe("importing tokens", () => {
  test("tokens sent on create are stored as given, with no request to the provider", async () => {
    const { service, agentVaultVariableDAL, agentVaultOauthService } = buildService({ rows: [] });

    const { variable, connected } = await service.createVariable({
      projectId: PROJECT_ID,
      ctx,
      scope: AgentVaultVariableScope.Global,
      key: "GDRIVE_U123",
      type: AgentVaultVariableType.OAuth,
      oauth: manualOauth,
      tokens: {
        accessToken: "ya29.access",
        refreshToken: "1//refresh",
        expiresAt: "2026-11-18T01:00:00+01:00",
        clientSecret: "client-secret"
      }
    });

    const columns = agentVaultVariableDAL.create.mock.calls[0][0];
    expect(opened(columns.encryptedValue)).toEqual({
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      clientSecret: "client-secret"
    });
    expect((columns.oauthConfig as TAgentVaultOauthVariableConfig).connection).toMatchObject({
      serverUrl: null,
      issuer: "https://accounts.google.com",
      tokenEndpoint: settings.tokenEndpoint,
      clientId: "client-1",
      tokenEndpointAuthMethod: "client_secret_basic",
      status: AgentVaultOauthStatus.Connected,
      expiresAt: "2026-11-18T00:00:00.000Z",
      accessTokenHash: hashAccessToken("ya29.access"),
      grantedScopes: settings.scopes
    });
    expect(variable.oauth?.status).toBe(AgentVaultOauthStatus.Connected);
    expect(connected).toMatchObject({ method: AgentVaultOauthVariableConnectMethod.Import, key: "GDRIVE_U123" });
    expect(agentVaultOauthService.prepareVariableSignIn).not.toHaveBeenCalled();
  });

  test("tokens for a variable that discovers its provider are refused, since there is nothing to refresh them with", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [] });

    await expect(
      service.createVariable({
        projectId: PROJECT_ID,
        ctx,
        scope: AgentVaultVariableScope.Global,
        key: "LINEAR_U123",
        type: AgentVaultVariableType.OAuth,
        oauth: { serverUrl: "https://mcp.linear.app/mcp" },
        tokens: { accessToken: "lin_access", refreshToken: "lin_refresh" }
      })
    ).rejects.toThrow(/set up by hand/);
    expect(agentVaultVariableDAL.create).not.toHaveBeenCalled();
  });

  test("tokens on an update replace the stored ones as given, under the settings the update leaves", async () => {
    const { service, agentVaultVariableDAL } = buildService({ rows: [oauthRow()] });

    const { valueReplaced, connected } = await service.updateVariable({
      projectId: PROJECT_ID,
      ctx,
      variableId: OAUTH_ID,
      oauth: { scopes: ["https://www.googleapis.com/auth/drive"] },
      tokens: { accessToken: "ya29.new", clientSecret: "client-secret" }
    });

    const columns = writtenColumns(agentVaultVariableDAL);
    expect(opened(columns.encryptedValue)).toEqual({ accessToken: "ya29.new", clientSecret: "client-secret" });
    expect((columns.oauthConfig as TAgentVaultOauthVariableConfig).connection).toMatchObject({
      accessTokenHash: hashAccessToken("ya29.new"),
      grantedScopes: ["https://www.googleapis.com/auth/drive"],
      expiresAt: null
    });
    expect(valueReplaced).toBe(true);
    expect(connected?.method).toBe(AgentVaultOauthVariableConnectMethod.Import);
  });

  test("tokens without a client secret keep the stored one while the client stays the same", async () => {
    const row = oauthRow();
    const { service, agentVaultVariableDAL } = buildService({
      rows: [
        {
          ...row,
          encryptedValue: Buffer.from(
            `sealed:${JSON.stringify({ accessToken: "ya29.old", clientSecret: "stored-secret" })}`
          )
        }
      ]
    });

    await service.updateVariable({
      projectId: PROJECT_ID,
      ctx,
      variableId: OAUTH_ID,
      oauth: { scopes: ["https://www.googleapis.com/auth/drive"] },
      tokens: { accessToken: "ya29.new" }
    });

    const columns = writtenColumns(agentVaultVariableDAL);
    expect(opened(columns.encryptedValue)).toEqual({ accessToken: "ya29.new", clientSecret: "stored-secret" });
    expect((columns.oauthConfig as TAgentVaultOauthVariableConfig).connection?.tokenEndpointAuthMethod).toBe(
      AgentVaultOauthClientAuthMethod.ClientSecretBasic
    );
  });

  test("tokens without a client secret drop the stored one when the same update changes the client", async () => {
    const row = oauthRow();
    const { service, agentVaultVariableDAL } = buildService({
      rows: [
        {
          ...row,
          encryptedValue: Buffer.from(
            `sealed:${JSON.stringify({ accessToken: "ya29.old", clientSecret: "stored-secret" })}`
          )
        }
      ]
    });

    await service.updateVariable({
      projectId: PROJECT_ID,
      ctx,
      variableId: OAUTH_ID,
      oauth: { clientId: "client-2" },
      tokens: { accessToken: "ya29.new" }
    });

    const columns = writtenColumns(agentVaultVariableDAL);
    expect(opened(columns.encryptedValue)).toEqual({ accessToken: "ya29.new" });
    expect((columns.oauthConfig as TAgentVaultOauthVariableConfig).connection).toMatchObject({
      clientId: "client-2",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None
    });
  });

  test("tokens are refused on a text variable", async () => {
    const { service } = buildService({ rows: [textRow()] });
    await expect(
      service.updateVariable({ projectId: PROJECT_ID, ctx, variableId: TEXT_ID, tokens: { accessToken: "a" } })
    ).rejects.toThrow(/takes no OAuth tokens/);
  });
});

describe("createVariable with a sign-in", () => {
  test("prepares the sign-in before the variable is saved, and stores it for the new variable after", async () => {
    const { service, agentVaultVariableDAL, agentVaultOauthService } = buildService({ rows: [] });

    const { signIn } = await service.createVariable({
      projectId: PROJECT_ID,
      ctx,
      scope: AgentVaultVariableScope.Global,
      key: "GDRIVE_U123",
      type: AgentVaultVariableType.OAuth,
      oauth: manualOauth,
      signIn: { clientSecret: "client-secret" }
    });

    expect(agentVaultOauthService.prepareVariableSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ connection: null, encryptedValue: null, clientSecret: "client-secret" })
    );
    expect(agentVaultOauthService.prepareVariableSignIn.mock.invocationCallOrder[0]).toBeLessThan(
      agentVaultVariableDAL.create.mock.invocationCallOrder[0]
    );
    expect(agentVaultOauthService.saveVariableSignIn).toHaveBeenCalledWith(
      expect.anything(),
      "33333333-3333-4333-8333-333333333333"
    );
    expect(signIn).toMatchObject({
      authorization: { id: "auth-1" },
      registrationRequired: false,
      redirectUri: "https://app.acme.test/oauth/callback"
    });
  });

  test("refuses a caller who can create variables but not read and edit them, before anything is prepared", async () => {
    const { service, agentVaultVariableDAL, agentVaultOauthService } = buildService({
      rows: [],
      rules: [
        { action: ProjectPermissionAgentVaultVariableActions.Create, subject: ProjectPermissionSub.AgentVaultVariables }
      ]
    });

    await expect(
      service.createVariable({
        projectId: PROJECT_ID,
        ctx,
        scope: AgentVaultVariableScope.Global,
        key: "GDRIVE_U123",
        type: AgentVaultVariableType.OAuth,
        oauth: manualOauth,
        signIn: {}
      })
    ).rejects.toThrow(ForbiddenRequestError);
    expect(agentVaultOauthService.prepareVariableSignIn).not.toHaveBeenCalled();
    expect(agentVaultVariableDAL.create).not.toHaveBeenCalled();
  });

  test("a key that's taken is refused before the sign-in is prepared", async () => {
    const { service, agentVaultVariableDAL, agentVaultOauthService } = buildService({ rows: [oauthRow()] });

    await expect(
      service.createVariable({
        projectId: PROJECT_ID,
        ctx,
        scope: AgentVaultVariableScope.Global,
        key: "GDRIVE_U123",
        type: AgentVaultVariableType.OAuth,
        oauth: manualOauth,
        signIn: {}
      })
    ).rejects.toThrow("A variable named 'GDRIVE_U123' already exists.");
    expect(agentVaultOauthService.prepareVariableSignIn).not.toHaveBeenCalled();
    expect(agentVaultVariableDAL.create).not.toHaveBeenCalled();
  });

  test("a sign-in that can't start yet still creates the variable, and says what it needs", async () => {
    const { service, agentVaultVariableDAL, agentVaultOauthService } = buildService({ rows: [] });
    agentVaultOauthService.prepareVariableSignIn.mockResolvedValueOnce({
      registrationRequired: true,
      manualSetupRequired: false,
      prefill: null,
      redirectUri: "https://app.infisical.test/agent-vault/oauth/callback",
      prepared: null
    });

    const { signIn } = await service.createVariable({
      projectId: PROJECT_ID,
      ctx,
      scope: AgentVaultVariableScope.Global,
      key: "LINEAR_U123",
      type: AgentVaultVariableType.OAuth,
      oauth: { serverUrl: "https://mcp.linear.app/mcp" },
      signIn: {}
    });

    expect(agentVaultVariableDAL.create).toHaveBeenCalled();
    expect(agentVaultOauthService.saveVariableSignIn).not.toHaveBeenCalled();
    expect(signIn).toMatchObject({ authorization: null, registrationRequired: true });
  });

  test("a sign-in that can't be saved after the create still returns the variable, with a message to start a new one", async () => {
    const { service, agentVaultVariableDAL, agentVaultOauthService } = buildService({ rows: [] });
    agentVaultOauthService.saveVariableSignIn.mockRejectedValueOnce(new Error("redis down"));

    const created = await service.createVariable({
      projectId: PROJECT_ID,
      ctx,
      scope: AgentVaultVariableScope.Global,
      key: "GDRIVE_U123",
      type: AgentVaultVariableType.OAuth,
      oauth: manualOauth,
      signIn: { clientSecret: "client-secret" }
    });

    expect(agentVaultVariableDAL.create).toHaveBeenCalled();
    expect(created.variable.key).toBe("GDRIVE_U123");
    expect(created.signIn).toBeNull();
    expect(created.signInError).toBe(
      "The variable was created, but its sign-in couldn't be started. Start a new sign-in for it."
    );
  });
});
