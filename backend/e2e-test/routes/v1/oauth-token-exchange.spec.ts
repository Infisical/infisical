import jwt from "jsonwebtoken";

import { seedData1 } from "@app/db/seed-data";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { OauthDelegationMode, OauthGrantType, OauthTokenType } from "@app/services/oauth-client/oauth-client-types";

const TOKEN_EXCHANGE_GRANT = OauthGrantType.TokenExchange;

const createClient = async (body: Record<string, unknown>) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/oauth/clients",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body
  });

const deleteClient = async (clientDbId: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/oauth/clients/${clientDbId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });

const rotateClientSecret = async (clientDbId: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/oauth/clients/${clientDbId}/rotate-secret`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });

const postToken = async (body: Record<string, string>) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams(body).toString()
  });

describe("OAuth client grant type registration", async () => {
  test("registering a redirect-flow application still works without sending grantTypes", async () => {
    const res = await createClient({
      name: "e2e-legacy-redirect-client",
      redirectUris: ["https://app.example.com/callback"]
    });

    expect(res.statusCode).toBe(200);
    const { client } = JSON.parse(res.payload) as { client: { id: string; grantTypes: string[] } };
    expect(client.grantTypes).toEqual([OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken]);

    await deleteClient(client.id);
  });

  test("the authorization code grant still requires a redirect URI", async () => {
    const res = await createClient({
      name: "e2e-no-redirect-uri",
      grantTypes: [OauthGrantType.AuthorizationCode],
      redirectUris: []
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("At least one redirect URI is required");
  });

  test("the refresh token grant cannot be registered on its own", async () => {
    const res = await createClient({
      name: "e2e-refresh-only",
      grantTypes: [OauthGrantType.RefreshToken],
      redirectUris: ["https://app.example.com/callback"]
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("requires the 'authorization_code' grant");
  });

  test("the token exchange grant requires an audience", async () => {
    const res = await createClient({
      name: "e2e-exchange-no-audience",
      grantTypes: [TOKEN_EXCHANGE_GRANT],
      redirectUris: []
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("token exchange audience is required");
  });

  test("PKCE cannot be required on an exchange-only application", async () => {
    const res = await createClient({
      name: "e2e-exchange-pkce",
      grantTypes: [TOKEN_EXCHANGE_GRANT],
      redirectUris: [],
      requirePkce: true,
      tokenExchangeAudience: "api://e2e-mcp"
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("PKCE only applies");
  });

  test("an audience cannot be set on a redirect-only application", async () => {
    const res = await createClient({
      name: "e2e-redirect-with-audience",
      grantTypes: [OauthGrantType.AuthorizationCode],
      redirectUris: ["https://app.example.com/callback"],
      tokenExchangeAudience: "api://e2e-mcp"
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("audience only applies");
  });

  // Rotation on a token exchange application needs SSO edit permission on top of OauthClients edit, but
  // it must stay a plain OauthClients operation for every other application. The seed actor holds both
  // permissions, so this pins the non-exchange path rather than the denial.
  test("rotating a redirect-flow application's secret needs no SSO permission", async () => {
    const created = await createClient({
      name: "e2e-rotate-redirect-client",
      redirectUris: ["https://app.example.com/callback"]
    });

    const { client, clientSecret } = JSON.parse(created.payload) as {
      client: { id: string };
      clientSecret: string;
    };

    const rotated = await rotateClientSecret(client.id);

    expect(rotated.statusCode).toBe(200);
    const { clientSecret: rotatedSecret } = JSON.parse(rotated.payload) as { clientSecret: string };
    expect(rotatedSecret).not.toBe(clientSecret);

    await deleteClient(client.id);
  });

  // The seed org has no OIDC config, and that config is the only trust anchor token exchange has.
  test("the token exchange grant cannot be enabled without an active OIDC SSO configuration", async () => {
    const res = await createClient({
      name: "e2e-exchange-no-sso",
      grantTypes: [TOKEN_EXCHANGE_GRANT],
      redirectUris: [],
      tokenExchangeAudience: "api://e2e-mcp"
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("OIDC SSO");
  });
});

describe("POST /api/v1/oauth/token, token exchange grant", async () => {
  let clientId: string;
  let clientSecret: string;
  let clientDbId: string;

  beforeAll(async () => {
    // Authenticates fine but is not registered for the exchange grant, which the cases below need.
    const res = await createClient({
      name: "e2e-token-endpoint-client",
      redirectUris: ["https://app.example.com/callback"]
    });

    const { client, clientSecret: secret } = JSON.parse(res.payload) as {
      client: { id: string; clientId: string };
      clientSecret: string;
    };

    clientDbId = client.id;
    clientId = client.clientId;
    clientSecret = secret;
  });

  afterAll(async () => {
    await deleteClient(clientDbId);
  });

  const exchangeBody = (overrides: Record<string, string> = {}) => ({
    grant_type: TOKEN_EXCHANGE_GRANT,
    subject_token: "eyJhbGciOiJSUzI1NiJ9.e30.signature",
    subject_token_type: OauthTokenType.Jwt,
    client_id: clientId,
    client_secret: clientSecret,
    ...overrides
  });

  test("rejects invalid client credentials", async () => {
    const res = await postToken(exchangeBody({ client_secret: "not-the-secret" }));

    expect(res.statusCode).toBe(401);
    expect(res.payload).toContain("Invalid OAuth client credentials");
  });

  test("rejects a client that is not registered for the exchange grant", async () => {
    const res = await postToken(exchangeBody());

    expect(res.statusCode).toBe(401);
    expect(res.payload).toContain(TOKEN_EXCHANGE_GRANT);
  });

  test("requires a subject token", async () => {
    const body = exchangeBody();
    delete (body as Record<string, string>).subject_token;

    const res = await postToken(body);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("subject_token");
  });

  test("requires a subject token type", async () => {
    const body = exchangeBody();
    delete (body as Record<string, string>).subject_token_type;

    const res = await postToken(body);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("subject_token_type");
  });

  test("rejects an unsupported requested token type", async () => {
    const res = await postToken(exchangeBody({ requested_token_type: OauthTokenType.IdToken }));

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("requested_token_type");
  });

  // RFC 8693 permits both, but this grant has no scope concept and its audience is fixed per
  // application, so silently dropping them is worse than a clear error.
  test("rejects a scope parameter rather than ignoring it", async () => {
    const res = await postToken(exchangeBody({ scope: "secrets:read" }));

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("'scope' parameter is not supported");
  });

  test("rejects an audience parameter rather than ignoring it", async () => {
    const res = await postToken(exchangeBody({ audience: "api://something-else" }));

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("not supported");
  });
});

// Mints a delegated token for the seed user on the same session as the working jwtAuthToken, so it
// passes signature and session validation and differs only by its delegation marker.
const signDelegatedToken = (markers: { scopes?: string[]; delegation?: OauthDelegationMode }) =>
  jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: seedData1.id,
      tokenVersionId: seedData1.token.id,
      authMethod: AuthMethod.OIDC,
      organizationId: seedData1.organization.id,
      accessVersion: 1,
      oauthClientId: "oauth_client_e2e_exchange",
      ...markers
    },
    process.env.AUTH_SECRET ?? "something-random",
    { expiresIn: "1h" }
  );

const readSecrets = async (token: string) =>
  testServer.inject({
    method: "GET",
    url: `/api/v3/secrets/raw`,
    headers: { authorization: `Bearer ${token}` },
    query: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: "/"
    }
  });

describe("Full delegation marker on a delegated OAuth token", async () => {
  test("a fully-delegated token carries the user's own permissions, unnarrowed", async () => {
    const token = signDelegatedToken({ delegation: OauthDelegationMode.Full });

    const res = await readSecrets(token);
    expect(res.statusCode).toBe(200);
  });

  // The invariant that makes the marker safe: dropping the claim by mistake cannot promote a token.
  test("a token carrying neither marker is denied", async () => {
    const token = signDelegatedToken({});

    const res = await readSecrets(token);
    expect(res.statusCode).toBe(403);
  });

  test("an empty scope list is still denied", async () => {
    const token = signDelegatedToken({ scopes: [] });

    const res = await readSecrets(token);
    expect(res.statusCode).toBe(403);
  });

  // Account self-management routes authenticate on userId alone and build no permission, so they must
  // stay unreachable whatever delegation marker the token carries.
  test("a fully-delegated token is still rejected on a JWT-only account route", async () => {
    const token = signDelegatedToken({ delegation: OauthDelegationMode.Full });

    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/user/me/totp`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(403);
  });
});
