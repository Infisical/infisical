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

const createFolder = async (token: string, name: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/folders`,
    headers: { authorization: `Bearer ${token}` },
    body: {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      name,
      path: "/"
    }
  });

describe("OAuth delegated token scope enforcement", async () => {
  // Control: a first-party session JWT (no oauthClientId) is never scope-narrowed, so the org admin
  // can create folders. This is the baseline the scoped cases are compared against.
  test("first-party session JWT can create a folder", async () => {
    const res = await createFolder(jwtAuthToken, "oauth-scope-control");
    expect(res.statusCode).toBe(200);

    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/folders/${res.json().folder.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { workspaceId: seedData1.project.id, environment: seedData1.environment.slug, path: "/" }
    });
  });

  test("a token scoped to secrets:write can create a folder", async () => {
    const token = signOauthToken(["secrets:write"]);
    const res = await createFolder(token, "oauth-scope-write");
    expect(res.statusCode).toBe(200);

    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/folders/${res.json().folder.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { workspaceId: seedData1.project.id, environment: seedData1.environment.slug, path: "/" }
    });
  });

  test("a token scoped to secrets:read only cannot create a folder", async () => {
    const token = signOauthToken(["secrets:read"]);
    const res = await createFolder(token, "oauth-scope-readonly");
    // read scope does not grant the Create action on SecretFolders → CASL forbids
    expect(res.statusCode).toBe(403);
  });

  test("a token with no scopes is denied (deny-by-default)", async () => {
    const token = signOauthToken([]);
    const res = await createFolder(token, "oauth-scope-empty");
    expect(res.statusCode).toBe(403);
  });

  test("unknown scopes are dropped, leaving an empty (denied) ability", async () => {
    // Even if a token somehow carries an unrecognized scope, it must not grant anything.
    const token = signOauthToken(["secrets:write:everything", "not-a-real-scope"]);
    const res = await createFolder(token, "oauth-scope-unknown");
    expect(res.statusCode).toBe(403);
  });
});
