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

const consent = async (body: Record<string, string>) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/oauth/authorize/consent",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body
  });

const postToken = async (body: Record<string, string>, headers: Record<string, string> = {}) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
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

  // An application is one flow or the other, so the UI's flow picker is the whole story and an edit made
  // through it can never silently drop a grant the API had registered.
  test("an application cannot hold both the redirect flow and token exchange", async () => {
    const res = await createClient({
      name: "e2e-both-flows",
      grantTypes: [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken, TOKEN_EXCHANGE_GRANT],
      redirectUris: ["https://app.example.com/callback"],
      tokenExchangeAudience: "api://e2e-mcp"
    });

    expect(res.statusCode).toBe(400);
    expect(res.payload).toContain("cannot be combined");
  });

  // Duplicates used to slip through below the array bound and come back as "too many items" above it,
  // so the same mistake failed differently depending on how often it was repeated.
  test("reports duplicate grant types as duplicates, however many there are", async () => {
    const res = await createClient({
      name: "e2e-duplicate-grants",
      grantTypes: [
        OauthGrantType.AuthorizationCode,
        OauthGrantType.AuthorizationCode,
        OauthGrantType.AuthorizationCode,
        OauthGrantType.RefreshToken
      ],
      redirectUris: ["https://app.example.com/callback"]
    });

    expect(res.statusCode).toBe(422);
    expect(res.payload).toContain("duplicate");
  });

  // Rotation needs SSO edit on top of OauthClients edit for token exchange applications, but must stay a
  // plain OauthClients operation for everything else. The seed actor holds both, so this pins the
  // non-exchange path, not the denial.
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

  // The seed org has no OIDC config, which is the only trust anchor token exchange has.
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

  // RFC 6749 section 5.2 and RFC 8693 section 2.2.2: the token endpoint answers with an `error` code
  // from a fixed list plus an `error_description`, never the house `{ statusCode, message, error }`
  // envelope, because generic client libraries branch on that code.
  const expectOauthError = (
    res: { statusCode: number; payload: string },
    statusCode: number,
    code: string,
    descriptionFragment: string
  ) => {
    expect(res.statusCode).toBe(statusCode);

    const body = JSON.parse(res.payload) as { error?: string; error_description?: string; message?: string };
    expect(body.error).toBe(code);
    expect(body.error_description).toContain(descriptionFragment);
    expect(body.message).toBeUndefined();
  };

  test("rejects invalid client credentials", async () => {
    const res = await postToken(exchangeBody({ client_secret: "not-the-secret" }));

    expectOauthError(res, 401, "invalid_client", "Invalid OAuth client credentials");
  });

  // RFC 6749 section 5.2 requires a challenge for the scheme the client authenticated with.
  test("challenges a basic-auth client whose credentials are rejected", async () => {
    const body = exchangeBody();
    delete (body as Record<string, string>).client_id;
    delete (body as Record<string, string>).client_secret;

    const res = await postToken(body, {
      authorization: `Basic ${Buffer.from(`${clientId}:not-the-secret`).toString("base64")}`
    });

    expectOauthError(res, 401, "invalid_client", "Invalid OAuth client credentials");
    expect(res.headers["www-authenticate"]).toContain("Basic");
  });

  test("rejects a client that is not registered for the exchange grant", async () => {
    const res = await postToken(exchangeBody());

    expectOauthError(res, 400, "unauthorized_client", TOKEN_EXCHANGE_GRANT);
  });

  test("rejects an unrecognized grant type", async () => {
    const res = await postToken(exchangeBody({ grant_type: "client_credentials" }));

    expectOauthError(res, 400, "unsupported_grant_type", "grant_type");
  });

  test("requires a subject token", async () => {
    const body = exchangeBody();
    delete (body as Record<string, string>).subject_token;

    const res = await postToken(body);

    expectOauthError(res, 400, "invalid_request", "subject_token");
  });

  test("requires a subject token type", async () => {
    const body = exchangeBody();
    delete (body as Record<string, string>).subject_token_type;

    const res = await postToken(body);

    expectOauthError(res, 400, "invalid_request", "subject_token_type");
  });

  test("rejects an unsupported requested token type", async () => {
    const res = await postToken(exchangeBody({ requested_token_type: OauthTokenType.IdToken }));

    expectOauthError(res, 400, "invalid_request", "requested_token_type");
  });

  // RFC 8693 allows both, but this grant has no scopes and its audience is fixed per application, so
  // silently ignoring them is worse than a clear error.
  test("rejects a scope parameter rather than ignoring it", async () => {
    const res = await postToken(exchangeBody({ scope: "secrets:read" }));

    expectOauthError(res, 400, "invalid_scope", "'scope' parameter is not supported");
  });

  test("rejects an audience parameter rather than ignoring it", async () => {
    const res = await postToken(exchangeBody({ audience: "api://something-else" }));

    expectOauthError(res, 400, "invalid_target", "not supported");
  });

  // Ignoring these would answer a delegation request with an impersonation token, since the issued
  // token records no acting party.
  test("rejects an actor token rather than ignoring it", async () => {
    const res = await postToken(exchangeBody({ actor_token: "some.actor.jwt" }));

    expectOauthError(res, 400, "invalid_request", "'actor_token'");
  });

  test("rejects an actor token type on its own", async () => {
    const res = await postToken(exchangeBody({ actor_token_type: OauthTokenType.Jwt }));

    expectOauthError(res, 400, "invalid_request", "'actor_token'");
  });
});

// Same session as the working jwtAuthToken, so it passes signature and session validation and differs
// only by its delegation marker.
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

  // The invariant that makes the marker safe: dropping the claim by mistake can't promote a token.
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

  // Org deletion reissues the caller's session through generateUserTokens, which has no oauthClientId
  // or delegation parameter, so a delegated caller would exit holding a first-party session.
  test("a fully-delegated token cannot delete the organization", async () => {
    const token = signDelegatedToken({ delegation: OauthDelegationMode.Full });

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${seedData1.organization.id}`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(403);
  });

  test("a fully-delegated token can read an administration resource", async () => {
    const token = signDelegatedToken({ delegation: OauthDelegationMode.Full });

    const res = await testServer.inject({
      method: "GET",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
  });

  // verifyAuth runs on onRequest, ahead of schema validation, so the membership id never has to exist:
  // a delegated token is turned away for the auth mode alone.
  test("a fully-delegated token cannot write to an administration resource", async () => {
    const token = signDelegatedToken({ delegation: OauthDelegationMode.Full });

    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships/2d4f1a0e-7c31-4f5f-9b26-8e0a7c1d5b93`,
      headers: { authorization: `Bearer ${token}` },
      body: { role: "member" }
    });

    expect(res.statusCode).toBe(403);
  });

  // The SSO config read hands back the OIDC client secret, so it stays first-party alongside the writes.
  test("a fully-delegated token cannot read a config that returns credential material", async () => {
    const token = signDelegatedToken({ delegation: OauthDelegationMode.Full });

    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/sso/oidc/config`,
      headers: { authorization: `Bearer ${token}` },
      query: { organizationId: seedData1.organization.id }
    });

    expect(res.statusCode).toBe(403);
  });

  // Account routes authenticate on userId alone and build no permission, so they have to stay
  // unreachable whatever delegation marker the token carries.
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

// A refresh token only works if the application holds the refresh_token grant, so issuing one without it
// hands back a credential the token endpoint rejects on use.
describe("Access token TTL is per application", async () => {
  const REDIRECT_URI = "https://app.example.com/callback";

  const issueAccessToken = async (accessTokenTTL?: number) => {
    const created = await createClient({
      name: `e2e-access-token-ttl-${accessTokenTTL ?? "default"}`,
      grantTypes: [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken],
      redirectUris: [REDIRECT_URI],
      ...(accessTokenTTL === undefined ? {} : { accessTokenTTL })
    });

    expect(created.statusCode).toBe(200);
    const { client, clientSecret } = JSON.parse(created.payload) as {
      client: { id: string; clientId: string; accessTokenTTL: number };
      clientSecret: string;
    };

    const consented = await consent({ client_id: client.clientId, redirect_uri: REDIRECT_URI });
    const { callbackUrl } = JSON.parse(consented.payload) as { callbackUrl: string };

    const token = await postToken({
      grant_type: OauthGrantType.AuthorizationCode,
      code: new URL(callbackUrl).searchParams.get("code") as string,
      redirect_uri: REDIRECT_URI,
      client_id: client.clientId,
      client_secret: clientSecret
    });

    return { client, token };
  };

  test("defaults to one day when the field is omitted", async () => {
    const { client, token } = await issueAccessToken();

    expect(client.accessTokenTTL).toBe(86400);
    expect(token.statusCode).toBe(200);
    expect((JSON.parse(token.payload) as { expires_in: number }).expires_in).toBe(86400);

    await deleteClient(client.id);
  });

  test("a shorter TTL becomes the issued token's expires_in", async () => {
    const { client, token } = await issueAccessToken(1800);

    expect(client.accessTokenTTL).toBe(1800);
    expect(token.statusCode).toBe(200);
    expect((JSON.parse(token.payload) as { expires_in: number }).expires_in).toBe(1800);

    await deleteClient(client.id);
  });

  // The application's TTL is a ceiling, not an override, so asking for longer than the instance
  // allows must not widen it past JWT_AUTH_LIFETIME.
  test("a TTL longer than the instance lifetime is capped, not honoured", async () => {
    const { client, token } = await issueAccessToken(90 * 24 * 60 * 60);

    expect(client.accessTokenTTL).toBe(90 * 24 * 60 * 60);
    expect(token.statusCode).toBe(200);
    const { expires_in: expiresIn } = JSON.parse(token.payload) as { expires_in: number };
    expect(expiresIn).toBeLessThan(client.accessTokenTTL);

    await deleteClient(client.id);
  });

  test("rejects a TTL outside the allowed bounds", async () => {
    const tooShort = await createClient({
      name: "e2e-access-token-ttl-too-short",
      redirectUris: [REDIRECT_URI],
      accessTokenTTL: 59
    });
    expect(tooShort.statusCode).toBe(422);

    const tooLong = await createClient({
      name: "e2e-access-token-ttl-too-long",
      redirectUris: [REDIRECT_URI],
      accessTokenTTL: 90 * 24 * 60 * 60 + 1
    });
    expect(tooLong.statusCode).toBe(422);
  });

  test("an update changes the TTL of tokens issued afterwards", async () => {
    const { client } = await issueAccessToken(3600);

    const updated = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/oauth/clients/${client.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { accessTokenTTL: 600 }
    });
    expect(updated.statusCode).toBe(200);

    const consented = await consent({ client_id: client.clientId, redirect_uri: REDIRECT_URI });
    const { callbackUrl } = JSON.parse(consented.payload) as { callbackUrl: string };

    // The secret is unchanged by the update, so a fresh code redeems against the new TTL.
    const clientSecretRes = await rotateClientSecret(client.id);
    const { clientSecret } = JSON.parse(clientSecretRes.payload) as { clientSecret: string };

    const token = await postToken({
      grant_type: OauthGrantType.AuthorizationCode,
      code: new URL(callbackUrl).searchParams.get("code") as string,
      redirect_uri: REDIRECT_URI,
      client_id: client.clientId,
      client_secret: clientSecret
    });

    expect(token.statusCode).toBe(200);
    expect((JSON.parse(token.payload) as { expires_in: number }).expires_in).toBe(600);

    await deleteClient(client.id);
  });
});

describe("Refresh token issuance follows the registered grants", async () => {
  const REDIRECT_URI = "https://app.example.com/callback";

  const runCodeFlow = async (grantTypes: OauthGrantType[]) => {
    const created = await createClient({
      name: `e2e-refresh-issuance-${grantTypes.length}`,
      grantTypes,
      redirectUris: [REDIRECT_URI]
    });

    const { client, clientSecret } = JSON.parse(created.payload) as {
      client: { id: string; clientId: string };
      clientSecret: string;
    };

    const consented = await consent({ client_id: client.clientId, redirect_uri: REDIRECT_URI });
    expect(consented.statusCode).toBe(200);

    const { callbackUrl } = JSON.parse(consented.payload) as { callbackUrl: string };
    const code = new URL(callbackUrl).searchParams.get("code") as string;

    const token = await postToken({
      grant_type: OauthGrantType.AuthorizationCode,
      code,
      redirect_uri: REDIRECT_URI,
      client_id: client.clientId,
      client_secret: clientSecret
    });

    return { clientDbId: client.id, token };
  };

  test("issues a refresh token when the application holds the refresh_token grant", async () => {
    const { clientDbId, token } = await runCodeFlow([OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken]);

    expect(token.statusCode).toBe(200);
    expect(JSON.parse(token.payload)).toHaveProperty("refresh_token");

    await deleteClient(clientDbId);
  });

  test("omits the refresh token when the application does not", async () => {
    const { clientDbId, token } = await runCodeFlow([OauthGrantType.AuthorizationCode]);

    expect(token.statusCode).toBe(200);
    const body = JSON.parse(token.payload) as Record<string, unknown>;
    expect(body).not.toHaveProperty("refresh_token");
    expect(body).toHaveProperty("access_token");

    await deleteClient(clientDbId);
  });
});
