import jwt from "jsonwebtoken";

import { seedData1 } from "@app/db/seed-data";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

// Mints a delegated OAuth access token for the seed user (an org admin) with the given scopes. It
// reuses the same session (tokenVersionId/accessVersion) as the working jwtAuthToken, so it passes
// signature + session validation and only differs by the oauthClientId/scopes claims.
const signOauthToken = (scopes: string[]) =>
  jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: seedData1.id,
      tokenVersionId: seedData1.token.id,
      authMethod: AuthMethod.EMAIL,
      organizationId: seedData1.organization.id,
      accessVersion: 1,
      oauthClientId: "oauth_client_e2e_test",
      scopes
    },
    process.env.AUTH_SECRET ?? "something-random",
    { expiresIn: "1h" }
  );

// GET /api/v3/secrets/raw — the secret-read endpoint `infisical run` calls at runtime. This is one
// of the few routes that explicitly opts into AuthMode.OAUTH, so a delegated token can reach it; the
// secrets:read scope then narrows the (admin) ability down to read-only.
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

const createFolder = async (token: string, name: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/folders`,
    headers: { authorization: `Bearer ${token}` },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      name,
      path: "/"
    }
  });

describe("OAuth delegated token scope enforcement", async () => {
  // Control: a first-party session JWT (no oauthClientId) is never scope-narrowed, so the org admin
  // can read secrets. This is the baseline the scoped cases are compared against.
  test("first-party session JWT can read secrets", async () => {
    const res = await readSecrets(jwtAuthToken);
    expect(res.statusCode).toBe(200);
  });

  test("a token scoped to secrets:read can read secrets", async () => {
    const token = signOauthToken(["secrets:read"]);
    const res = await readSecrets(token);
    expect(res.statusCode).toBe(200);
  });

  test("a token with no scopes is denied (deny-by-default)", async () => {
    const token = signOauthToken([]);
    const res = await readSecrets(token);
    // empty scopes → empty ability → CASL forbids the read
    expect(res.statusCode).toBe(403);
  });

  test("unknown scopes are dropped, leaving an empty (denied) ability", async () => {
    // Even if a token somehow carries an unrecognized scope, it must not grant anything.
    const token = signOauthToken(["secrets:read:everything", "not-a-real-scope"]);
    const res = await readSecrets(token);
    expect(res.statusCode).toBe(403);
  });

  // Surface boundary: only secret-read routes opt into AuthMode.OAUTH. A write route like folder
  // creation is JWT-only, so a delegated token is rejected at the auth layer (403) regardless of the
  // scope it carries — it never reaches the scope-narrowing in permission-building.
  test("a delegated token cannot reach a non-opted-in write route", async () => {
    const token = signOauthToken(["secrets:read"]);
    const res = await createFolder(token, "oauth-scope-write-denied");
    expect(res.statusCode).toBe(403);
  });

  // Security regression: account-management routes (TOTP, MFA, sessions, password) authenticate on
  // userId alone and never build a scope-narrowed permission. They must NOT opt into AuthMode.OAUTH,
  // so a delegated token — even minted from a valid admin session — is rejected at the auth layer.
  test("a delegated token is rejected on a JWT-only account route (GET /me/totp)", async () => {
    const token = signOauthToken(["secrets:read"]);
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/user/me/totp`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(403);
  });

  test("the same account route is reachable by the first-party session JWT", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/user/me/totp`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    // 200 (configured) or 404 (no TOTP set up) — the point is it is NOT 403/forbidden by auth mode.
    expect(res.statusCode).not.toBe(403);
  });
});
