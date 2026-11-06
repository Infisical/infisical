import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ConflictError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { memberOauthSetupOf } from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import { AgentVaultOauthRegistration } from "../agent-vault-oauth/agent-vault-oauth-types";
import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultVariableReferenceField
} from "../agent-vault/agent-vault-enums";
import { agentVaultPersonalValueServiceFactory } from "./agent-vault-personal-value-service";

vi.mock("../agent-vault/agent-vault-permission", () => ({
  getAgentVaultGrantedReachability: vi.fn(async () => ({
    isAdmin: false,
    accessBundleIds: ["22222222-2222-4222-8222-222222222222"],
    grantedAccessBundleIds: ["22222222-2222-4222-8222-222222222222"],
    permission: createMongoAbility([{ action: "read", subject: "agent-vault-access-bundles" }])
  }))
}));

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const BUNDLE_ID = "22222222-2222-4222-8222-222222222222";
const SERVICE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const SERVER_URL = "https://mcp.example.com/mcp";

const memberService = (overrides: Record<string, unknown> = {}) => ({
  id: SERVICE_ID,
  name: "example",
  accessBundleId: BUNDLE_ID,
  type: AgentVaultServiceType.Mcp,
  config: { serverUrl: SERVER_URL, transport: "streamable-http" },
  credentialType: AgentVaultCredentialType.OAuth,
  credentialConfig: {
    type: AgentVaultCredentialType.OAuth,
    serverUrl: SERVER_URL,
    issuer: "https://auth.example.com",
    registration: AgentVaultOauthRegistration.Manual,
    clientId: "client-a"
  },
  encryptedCredential: Buffer.from("sealed-secret-a"),
  memberProvidedFields: [AgentVaultVariableReferenceField.CredentialValue],
  ...overrides
});

const builtConfig = { issuer: "https://auth.example.com", status: "connected", requiredScopes: [] };

const setup = ({
  readService = memberService(),
  lockedService = readService,
  grants = [{ id: "grant" }],
  createFails = false
}: {
  readService?: ReturnType<typeof memberService>;
  lockedService?: ReturnType<typeof memberService>;
  grants?: unknown[];
  createFails?: boolean;
} = {}) => {
  const restore = vi.fn(async () => {});
  const claimAuthorization = vi.fn(async () => ({
    record: { issuer: "https://auth.example.com", memberSetup: memberOauthSetupOf(memberService()) },
    restore
  }));
  const create = vi.fn(async () => {
    if (createFails) throw new Error("write failed");
    return {};
  });
  const tx = {};
  const service = agentVaultPersonalValueServiceFactory({
    agentVaultPersonalValueDAL: {
      transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      lockGrantsForOwner: vi.fn(async () => grants),
      lockAdminRolesForOwner: vi.fn(async () => []),
      lockForOwnerAndService: vi.fn(async () => []),
      delete: vi.fn(async () => []),
      create,
      findServicesNeedingValues: vi.fn(async () => []),
      findForOwner: vi.fn(async () => [])
    } as never,
    agentVaultPersonalValueReferenceDAL: {} as never,
    agentVaultVariableDAL: {} as never,
    agentVaultServiceDAL: {
      findByIdInProject: vi.fn(async () => readService),
      lockForPersonalValues: vi.fn(async () => lockedService)
    } as never,
    agentVaultOauthService: {
      claimAuthorization,
      buildCredentialFromAuthorization: vi.fn(() => ({
        config: builtConfig,
        encryptedCredential: Buffer.from("sealed-tokens")
      }))
    } as never,
    permissionService: {} as never,
    membershipDAL: {} as never,
    kmsService: {} as never
  });

  const connect = () =>
    service.connectOauth({
      projectId: PROJECT_ID,
      accessBundleId: BUNDLE_ID,
      serviceId: SERVICE_ID,
      authorizationId: "authorization",
      ctx: {
        actor: ActorType.USER,
        actorId: USER_ID,
        actorAuthMethod: null,
        actorOrgId: "org"
      }
    });

  return { connect, create, restore, claimAuthorization };
};

describe("connectOauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("saves the sign-in as the member's personal value", async () => {
    const { connect, create, restore } = setup();

    await connect();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: SERVICE_ID,
        field: AgentVaultVariableReferenceField.CredentialValue,
        userId: USER_ID,
        encryptedValue: Buffer.from("sealed-tokens"),
        oauthConfig: builtConfig
      }),
      expect.anything()
    );
    expect(restore).not.toHaveBeenCalled();
  });

  test("refuses a sign-in started before an admin rotated the client secret", async () => {
    const rotated = memberService({ encryptedCredential: Buffer.from("sealed-secret-b") });
    const { connect, create, restore } = setup({ readService: rotated });

    await expect(connect()).rejects.toThrow(ConflictError);
    expect(create).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalled();
  });

  test("refuses a sign-in started before an admin switched the client", async () => {
    const switched = memberService({
      credentialConfig: { ...memberService().credentialConfig, clientId: "client-b" }
    });
    const { connect, create } = setup({ readService: switched });

    await expect(connect()).rejects.toThrow(ConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  test("refuses a save when the service changed between its read and the lock", async () => {
    const moved = memberService({
      config: { serverUrl: "https://other.example.com/mcp", transport: "streamable-http" }
    });
    const { connect, create, restore } = setup({ lockedService: moved });

    await expect(connect()).rejects.toThrow(ConflictError);
    expect(create).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalled();
  });

  test("refuses a member who lost the bundle before the lock", async () => {
    const { connect, create, restore } = setup({ grants: [] });

    await expect(connect()).rejects.toThrow(NotFoundError);
    expect(create).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalled();
  });

  test("puts the authorization back when the write fails", async () => {
    const { connect, restore } = setup({ createFails: true });

    await expect(connect()).rejects.toThrow("write failed");
    expect(restore).toHaveBeenCalled();
  });
});

describe("findStatusesForOwner", () => {
  const OTHER_SERVICE_ID = "55555555-5555-4555-8555-555555555555";
  const updatedAt = new Date("2026-11-01T00:00:00Z");
  const serviceRow = (serviceId: string, credentialType: AgentVaultCredentialType, memberProvidedFields: string[]) => ({
    serviceId,
    serviceName: serviceId,
    hostPattern: "mcp.example.com",
    credentialType,
    memberProvidedFields,
    accessBundleId: BUNDLE_ID,
    accessBundleName: "bundle"
  });
  const oauthConfig = (status: AgentVaultOauthStatus, grantedScopes: string[], requiredScopes: string[]) => ({
    issuer: "https://auth.example.com",
    status,
    grantedScopes,
    requiredScopes,
    authorizedAt: "2026-11-01T00:00:00.000Z"
  });

  const statuses = (values: unknown[], services: unknown[]) =>
    agentVaultPersonalValueServiceFactory({
      agentVaultPersonalValueDAL: {
        findServicesNeedingValues: vi.fn(async () => services),
        findForOwner: vi.fn(async () => values)
      } as never,
      agentVaultPersonalValueReferenceDAL: {} as never,
      agentVaultVariableDAL: {} as never,
      agentVaultServiceDAL: {} as never,
      agentVaultOauthService: {} as never,
      permissionService: {} as never,
      membershipDAL: {} as never,
      kmsService: {} as never
    }).findStatusesForOwner({
      projectId: PROJECT_ID,
      owner: { userId: USER_ID },
      accessBundleIds: null,
      withVariableReferences: false
    });

  const oauthService = serviceRow(SERVICE_ID, AgentVaultCredentialType.OAuth, [
    AgentVaultVariableReferenceField.CredentialValue
  ]);
  const oauthValue = (config: unknown) => ({
    id: "value",
    serviceId: SERVICE_ID,
    field: AgentVaultVariableReferenceField.CredentialValue,
    updatedAt,
    oauthConfig: config
  });

  test("reports a connected sign-in on its field and counts it as configured", async () => {
    const [status] = await statuses(
      [oauthValue(oauthConfig(AgentVaultOauthStatus.Connected, ["read"], ["read"]))],
      [oauthService]
    );

    expect(status.isConfigured).toBe(true);
    expect(status.fields[0].oauth).toEqual(
      expect.objectContaining({
        status: AgentVaultOauthStatus.Connected,
        issuer: "https://auth.example.com",
        grantedScopes: ["read"],
        requiredScopes: ["read"]
      })
    );
  });

  test("keeps a connection missing a scope configured and reports the scopes", async () => {
    const [status] = await statuses(
      [oauthValue(oauthConfig(AgentVaultOauthStatus.NeedsAdditionalScopes, ["read"], ["read", "write"]))],
      [oauthService]
    );

    expect(status.isConfigured).toBe(true);
    expect(status.fields[0].oauth).toEqual(
      expect.objectContaining({
        status: AgentVaultOauthStatus.NeedsAdditionalScopes,
        grantedScopes: ["read"],
        requiredScopes: ["read", "write"]
      })
    );
  });

  test("counts a sign-in that needs reauthorization as not configured", async () => {
    const [status] = await statuses(
      [oauthValue(oauthConfig(AgentVaultOauthStatus.NeedsReauthorization, ["read"], ["read"]))],
      [oauthService]
    );

    expect(status.isConfigured).toBe(false);
    expect(status.fields[0].isSet).toBe(true);
    expect(status.fields[0].oauth?.status).toBe(AgentVaultOauthStatus.NeedsReauthorization);
  });

  test("reports an OAuth field nobody connected as unset with no status", async () => {
    const [status] = await statuses([], [oauthService]);

    expect(status.isConfigured).toBe(false);
    expect(status.fields[0]).toEqual(expect.objectContaining({ isSet: false, oauth: null }));
  });

  test("gives a typed value no OAuth status", async () => {
    const [status] = await statuses(
      [
        {
          id: "value",
          serviceId: OTHER_SERVICE_ID,
          field: AgentVaultVariableReferenceField.CredentialValue,
          updatedAt,
          oauthConfig: null
        }
      ],
      [
        serviceRow(OTHER_SERVICE_ID, AgentVaultCredentialType.Bearer, [
          AgentVaultVariableReferenceField.CredentialValue
        ])
      ]
    );

    expect(status.isConfigured).toBe(true);
    expect(status.fields[0]).toEqual(expect.objectContaining({ isSet: true, oauth: null }));
  });
});
