import crypto from "node:crypto";

import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const getMachineIdentityToken = async () => {
  const loginRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: {
      clientId: seedData1.machineIdentity.clientCredentials.id,
      clientSecret: seedData1.machineIdentity.clientCredentials.secret
    }
  });
  expect(loginRes.statusCode).toBe(200);
  return loginRes.json().accessToken as string;
};

describe("Org membership routes with machine identity auth", () => {
  const createdUserIds: string[] = [];
  let identityToken: string;

  beforeAll(async () => {
    identityToken = await getMachineIdentityToken();
  });

  afterAll(async () => {
    const db = getDb();
    if (createdUserIds.length) {
      await db(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
      await db(TableName.Users).whereIn("id", createdUserIds).del();
    }
  });

  // A throwaway member in the seeded org. Never an admin, so removing it cannot trip the
  // last-admin guard.
  const addMember = async () => {
    const db = getDb();
    const suffix = crypto.randomUUID().slice(0, 8);
    const [user] = await db(TableName.Users)
      .insert({
        email: `mi-member-${suffix}@localhost.local`,
        username: `mi-member-${suffix}`,
        isGhost: false,
        isEmailVerified: true,
        authMethods: ["email"]
      })
      .returning("*");
    createdUserIds.push(user.id);

    const [membership] = await db(TableName.Membership)
      .insert({
        actorUserId: user.id,
        scopeOrgId: seedData1.organization.id,
        scope: AccessScope.Organization,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: membership.id, role: OrgMembershipRole.Member });

    return membership.id;
  };

  const membershipExists = async (membershipId: string) => {
    const row = await getDb()(TableName.Membership).where({ id: membershipId }).first();
    return Boolean(row);
  };

  test("DELETE membership removes the member", async () => {
    const membershipId = await addMember();

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships/${membershipId}`,
      headers: { authorization: `Bearer ${identityToken}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().membership.id).toBe(membershipId);
    await expect(membershipExists(membershipId)).resolves.toBe(false);
  });

  test("bulk DELETE memberships removes the members", async () => {
    const membershipIds = [await addMember(), await addMember()];

    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships`,
      headers: { authorization: `Bearer ${identityToken}` },
      body: { membershipIds }
    });

    expect(res.statusCode).toBe(200);
    expect(
      res
        .json()
        .memberships.map((el: { id: string }) => el.id)
        .sort()
    ).toEqual([...membershipIds].sort());
    await expect(membershipExists(membershipIds[0])).resolves.toBe(false);
    await expect(membershipExists(membershipIds[1])).resolves.toBe(false);
  });

  test("PATCH membership deactivates the member", async () => {
    const membershipId = await addMember();

    const res = await testServer.inject({
      method: "PATCH",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships/${membershipId}`,
      headers: { authorization: `Bearer ${identityToken}` },
      body: { isActive: false }
    });

    expect(res.statusCode).toBe(200);
    const row = await getDb()(TableName.Membership).where({ id: membershipId }).first();
    expect(row?.isActive).toBe(false);
  });

  // An identity's org membership carries metadata keyed by identityId with a null userId. It exists
  // here so the PATCH assertion below can prove the route no longer clears every such row in the org.
  const addIdentityMember = async () => {
    const db = getDb();
    const suffix = crypto.randomUUID().slice(0, 8);
    const [identity] = await db(TableName.Identity)
      .insert({ name: `mi-reject-${suffix}`, orgId: seedData1.organization.id } as never)
      .returning("*");
    const [membership] = await db(TableName.Membership)
      .insert({
        actorIdentityId: identity.id,
        scopeOrgId: seedData1.organization.id,
        scope: AccessScope.Organization
      })
      .returning("*");
    const [metadata] = await db(TableName.IdentityMetadata)
      .insert({ identityId: identity.id, orgId: seedData1.organization.id, key: "team", value: "platform" })
      .returning("*");

    const cleanup = async () => {
      await db(TableName.IdentityMetadata).where({ identityId: identity.id }).del();
      await db(TableName.Membership).where({ id: membership.id }).del();
      await db(TableName.Identity).where({ id: identity.id }).del();
    };

    return { membershipId: membership.id, metadataId: metadata.id, cleanup };
  };

  // Identity and group org memberships live in the same table as user memberships, so the user
  // membership routes have to reject them rather than act on them under a user's audit event.
  test("DELETE refuses an identity's org membership", async () => {
    const { membershipId, cleanup } = await addIdentityMember();

    try {
      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v2/organizations/${seedData1.organization.id}/memberships/${membershipId}`,
        headers: { authorization: `Bearer ${identityToken}` }
      });

      expect(res.statusCode).toBe(404);
      await expect(membershipExists(membershipId)).resolves.toBe(true);
    } finally {
      await cleanup();
    }
  });

  test("PATCH refuses an identity's org membership without clearing identity metadata", async () => {
    const { membershipId, metadataId, cleanup } = await addIdentityMember();

    try {
      const res = await testServer.inject({
        method: "PATCH",
        url: `/api/v2/organizations/${seedData1.organization.id}/memberships/${membershipId}`,
        headers: { authorization: `Bearer ${identityToken}` },
        body: { metadata: [{ key: "team", value: "overwritten" }] }
      });

      expect(res.statusCode).toBe(404);
      const metadata = await getDb()(TableName.IdentityMetadata).where({ id: metadataId }).first();
      expect(metadata?.value).toBe("platform");
    } finally {
      await cleanup();
    }
  });

  // These asserted 200-with-empty-body before machine identities could reach the handlers, so the
  // status code is the regression guard: any 2xx here means the request was silently dropped again.
  test("DELETE reports an unknown membership instead of reporting success", async () => {
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships/${crypto.randomUUID()}`,
      headers: { authorization: `Bearer ${identityToken}` }
    });

    expect(res.statusCode).toBe(404);
  });

  test("bulk DELETE reports an unknown membership instead of reporting success", async () => {
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${seedData1.organization.id}/memberships`,
      headers: { authorization: `Bearer ${identityToken}` },
      body: { membershipIds: [crypto.randomUUID()] }
    });

    expect(res.statusCode).toBe(404);
  });
});
