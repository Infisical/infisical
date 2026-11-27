import jwt from "jsonwebtoken";

import { seedData1 } from "@app/db/seed-data";
import { AuthMethod, AuthTokenType } from "@app/lib/auth/actor-types";
import { OauthDelegationMode } from "@app/services/oauth-client/oauth-client-types";

import { createEmptyOrg, deleteOrgs } from "../../testUtils/fixtures";

// A delegated OAuth token for the seed user, an instance admin on this self-hosted test server, on the same session
// as jwtAuthToken.
const signDelegatedToken = (delegationClaim: { scopes: string[] } | { delegation: OauthDelegationMode }) =>
  jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: seedData1.id,
      tokenVersionId: seedData1.token.id,
      authMethod: AuthMethod.EMAIL,
      organizationId: seedData1.organization.id,
      accessVersion: 1,
      oauthClientId: "oauth_client_e2e_test",
      ...delegationClaim
    },
    process.env.AUTH_SECRET ?? "something-random",
    { expiresIn: "1h" }
  );

const readBreakdown = (token: string, orgId: string) =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/organizations/${orgId}/billing/v2/breakdowns/identities`,
    headers: { authorization: `Bearer ${token}` }
  });

describe("Billing reads across orgs by a self-hosted instance admin", () => {
  let otherOrgId: string;

  beforeEach(async () => {
    ({ orgId: otherOrgId } = await createEmptyOrg({ namePrefix: "billing-other" }));
  });

  afterEach(async () => {
    await deleteOrgs([otherOrgId]);
  });

  test("should let the admin's own session read an org they aren't a member of", async () => {
    // Action
    const res = await readBreakdown(jwtAuthToken, otherOrgId);

    // Assert
    expect(res.statusCode).toBe(200);
  });

  test("should let a fully delegated OAuth token read it too, since it carries the admin's whole reach", async () => {
    // Setup
    const token = signDelegatedToken({ delegation: OauthDelegationMode.Full });

    // Action
    const res = await readBreakdown(token, otherOrgId);

    // Assert
    expect(res.statusCode).toBe(200);
  });

  test("should refuse an OAuth token narrowed to scopes, even with the billing reach of an instance admin", async () => {
    // Setup
    const token = signDelegatedToken({ scopes: ["secrets:read"] });

    // Action
    const res = await readBreakdown(token, otherOrgId);

    // Assert
    expect(res.statusCode).toBe(403);
  });
});
