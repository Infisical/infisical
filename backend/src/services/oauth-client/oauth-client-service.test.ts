import { ForbiddenRequestError } from "@app/lib/errors";
import { AuthMethod } from "@app/services/auth/auth-type";

import { computePkceChallenge } from "./oauth-client-fns";
import { oauthClientServiceFactory } from "./oauth-client-service";
import { OauthGrantType } from "./oauth-client-types";
import { OauthTokenError, OauthTokenErrorCode } from "./oauth-token-error";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.example.com" }) }));

const MCP_RESOURCE = "https://app.example.com/api/mcp";
const REDIRECT_URI = "https://client.example.com/callback";
const MCP_OFF_MESSAGE =
  "MCP access is turned off for the organization Acme Corp. An organization admin can turn it back on in Organization Settings.";

const registeredClient = {
  id: "client-row-id",
  clientId: "registered-client",
  orgId: "org-id",
  name: "Acme Agent",
  description: null,
  redirectUris: [REDIRECT_URI],
  requirePkce: false,
  grantTypes: [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken],
  accessTokenTTL: null
};

const createService = ({ mcpEnabled }: { mcpEnabled: boolean }) => {
  const org = { id: "org-id", name: "Acme Corp", rootOrgId: null, mcpEnabled, enforceMfa: false };
  const keyStore = { setItemWithExpiry: vi.fn(), getItem: vi.fn(), deleteItem: vi.fn() };
  const tokenService = {
    getUserTokenSession: vi.fn().mockResolvedValue({ id: "session-id" }),
    createUserTokenSession: vi.fn().mockResolvedValue({ id: "session-id" }),
    getUserTokenSessionById: vi.fn()
  };

  const service = oauthClientServiceFactory({
    oauthClientDAL: { findOne: vi.fn().mockResolvedValue(registeredClient) },
    permissionService: { getOrgPermission: vi.fn().mockResolvedValue({}) },
    keyStore,
    tokenService,
    orgDAL: { findById: vi.fn().mockResolvedValue(org), findEffectiveOrgMembership: vi.fn() },
    userDAL: { findById: vi.fn().mockResolvedValue({ id: "user-id", isMfaEnabled: false }) },
    oidcConfigDAL: { findOne: vi.fn() },
    userAliasDAL: { findOne: vi.fn() },
    auditLogService: { createAuditLog: vi.fn() }
  } as never);

  return { service, keyStore, tokenService };
};

const consent = (resource?: string) => ({
  clientId: registeredClient.clientId,
  redirectUri: REDIRECT_URI,
  scope: resource ? "secrets:describe" : undefined,
  resource,
  orgId: "org-id",
  userId: "user-id",
  authMethod: AuthMethod.EMAIL,
  ip: "203.0.113.1"
});

describe("MCP access turned off for the organization", () => {
  test("consent to the MCP server is refused and issues no code", async () => {
    const { service, keyStore } = createService({ mcpEnabled: false });

    await expect(service.authorizeConsent(consent(MCP_RESOURCE))).rejects.toThrow(
      new ForbiddenRequestError({ message: MCP_OFF_MESSAGE })
    );
    expect(keyStore.setItemWithExpiry).not.toHaveBeenCalled();
  });

  test("consent that doesn't ask for the MCP server still works", async () => {
    const { service, keyStore } = createService({ mcpEnabled: false });

    const { callbackUrl } = await service.authorizeConsent(consent());

    expect(new URL(callbackUrl).searchParams.get("code")).toBeTruthy();
    expect(keyStore.setItemWithExpiry).toHaveBeenCalled();
  });

  test("consent to the MCP server works while it's on", async () => {
    const { service } = createService({ mcpEnabled: true });

    await expect(service.authorizeConsent(consent(MCP_RESOURCE))).resolves.toMatchObject({
      resource: MCP_RESOURCE
    });
  });

  test("a registered application's consent page is refused before sign-in, without naming the organization", async () => {
    const { service } = createService({ mcpEnabled: false });

    await expect(
      service.getAuthorizeInfo({
        clientId: registeredClient.clientId,
        redirectUri: REDIRECT_URI,
        scope: "secrets:describe",
        resource: MCP_RESOURCE
      })
    ).rejects.toThrow(
      "MCP access is turned off for the organization this application belongs to. An organization admin can turn it back on in Organization Settings."
    );
  });

  test("a code issued before MCP access was turned off can't be exchanged for tokens", async () => {
    const { service, keyStore, tokenService } = createService({ mcpEnabled: false });
    const clientId = "https://client.example.com/oauth/metadata.json";
    const codeVerifier = "a".repeat(43);
    keyStore.getItem.mockResolvedValue(
      JSON.stringify({
        clientId,
        orgId: "org-id",
        userId: "user-id",
        authMethod: AuthMethod.EMAIL,
        tokenVersionId: "session-id",
        redirectUri: REDIRECT_URI,
        codeChallenge: computePkceChallenge(codeVerifier),
        codeChallengeMethod: "S256",
        scopes: ["secrets:describe"],
        resource: MCP_RESOURCE
      })
    );

    const exchange = service.exchangeToken({
      grantType: OauthGrantType.AuthorizationCode,
      clientId,
      code: "code",
      redirectUri: REDIRECT_URI,
      codeVerifier
    });

    await expect(exchange).rejects.toBeInstanceOf(OauthTokenError);
    await expect(exchange).rejects.toMatchObject({
      oauthErrorCode: OauthTokenErrorCode.InvalidGrant,
      message: MCP_OFF_MESSAGE
    });
    expect(tokenService.getUserTokenSessionById).not.toHaveBeenCalled();
  });
});
