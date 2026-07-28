import jwt from "jsonwebtoken";

import { seedData1 } from "@app/db/seed-data";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

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

const getEncryptedProjectKey = async (token: string) =>
  testServer.inject({
    method: "GET",
    url: `/api/v2/workspace/${seedData1.project.id}/encrypted-key`,
    headers: { authorization: `Bearer ${token}` }
  });

describe("Project key route V2", async () => {
  test("a delegated token cannot reach the deprecated project-key route", async () => {
    const token = signOauthToken(["secrets:read"]);
    const res = await getEncryptedProjectKey(token);
    expect(res.statusCode).toBe(403);
  });

  test("a first-party session JWT can reach the deprecated project-key route", async () => {
    const res = await getEncryptedProjectKey(jwtAuthToken);
    expect(res.statusCode).toBe(200);
  });
});
