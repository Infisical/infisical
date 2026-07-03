import crypto from "node:crypto";

import jwt from "jsonwebtoken";
import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// The seeded auth-token session is user-scoped, so we can reuse it while pointing the JWT at any org
// the seeded user is an accepted member of. fnValidateJwtIdentity resolves the org from this payload.
const mintJwt = (orgId: string) =>
  jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: seedData1.id,
      tokenVersionId: seedData1.token.id,
      authMethod: AuthMethod.EMAIL,
      organizationId: orgId,
      accessVersion: 1
    },
    process.env.AUTH_SECRET as string,
    { expiresIn: "1h" }
  );

const callActivation = (orgId: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/user-activation/secrets",
    headers: { authorization: `Bearer ${mintJwt(orgId)}` }
  });

describe("User Activation Router", () => {
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];

  // Creates a fresh org (optionally backdated) with the seeded user as an accepted admin member, so
  // the invite-permission gate passes and org age / member count are the only variables under test.
  const createOrgWithAdmin = async (db: Knex, createdAt: Date) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const [org] = await db(TableName.Organization)
      .insert({ name: `ua-test-${suffix}`, slug: `ua-test-${suffix}`, createdAt } as never)
      .returning("*");
    createdOrgIds.push(org.id);

    const [membership] = await db(TableName.Membership)
      .insert({
        actorUserId: seedData1.id,
        scopeOrgId: org.id,
        scope: AccessScope.Organization,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: membership.id, role: OrgMembershipRole.Admin });

    return org;
  };

  // Adds an accepted, active, non-ghost user member so it is counted by countAllOrgMembers.
  const addAcceptedMember = async (db: Knex, orgId: string) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const [user] = await db(TableName.Users)
      .insert({
        email: `ua-${suffix}@localhost.local`,
        username: `ua-${suffix}`,
        isGhost: false,
        isEmailVerified: true,
        authMethods: ["email"]
      })
      .returning("*");
    createdUserIds.push(user.id);

    const [membership] = await db(TableName.Membership)
      .insert({
        actorUserId: user.id,
        scopeOrgId: orgId,
        scope: AccessScope.Organization,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: membership.id, role: OrgMembershipRole.Member });
  };

  const getActivationRow = (db: Knex, orgId: string) =>
    db(TableName.UserSecretActivation).where({ userId: seedData1.id, orgId }).first();

  afterAll(async () => {
    const db = getDb();
    if (createdOrgIds.length) {
      const memberships = await db(TableName.Membership).whereIn("scopeOrgId", createdOrgIds).select("id");
      const membershipIds = memberships.map((m) => m.id);
      if (membershipIds.length) await db(TableName.MembershipRole).whereIn("membershipId", membershipIds).del();
      await db(TableName.UserSecretActivation).whereIn("orgId", createdOrgIds).del();
      await db(TableName.Membership).whereIn("scopeOrgId", createdOrgIds).del();
      await db(TableName.Organization).whereIn("id", createdOrgIds).del();
    }
    if (createdUserIds.length) await db(TableName.Users).whereIn("id", createdUserIds).del();
  });

  test("old org (62 days) → no activation and no row created", async () => {
    const db = getDb();
    const org = await createOrgWithAdmin(db, daysAgo(62));

    const res = await callActivation(org.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().shouldShowActivation).toBe(false);

    const row = await getActivationRow(db, org.id);
    expect(row).toBeUndefined();
  });

  test("new org (60 days) with more than 5 users → no activation and no row created", async () => {
    const db = getDb();
    const org = await createOrgWithAdmin(db, daysAgo(60));
    // admin member + 5 more = 6 users (> 5)
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await addAcceptedMember(db, org.id);
    }

    const res = await callActivation(org.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().shouldShowActivation).toBe(false);

    const row = await getActivationRow(db, org.id);
    expect(row).toBeUndefined();
  });

  test("new org, < 5 users, first interaction → firstSecretCreatedAt is set", async () => {
    const db = getDb();
    const org = await createOrgWithAdmin(db, daysAgo(1));

    const res = await callActivation(org.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.shouldShowActivation).toBe(true);
    expect(body.stage).toBe("FIRST_SECRET");

    const row = await getActivationRow(db, org.id);
    expect(row).toBeDefined();
    expect(row?.firstSecretCreatedAt).not.toBeNull();
  });

  test("returning after 3 days → returnedAfterThreeDaysAt is set", async () => {
    const db = getDb();
    const org = await createOrgWithAdmin(db, daysAgo(5));
    await db(TableName.UserSecretActivation).insert({
      userId: seedData1.id,
      orgId: org.id,
      firstSecretCreatedAt: daysAgo(4)
    });

    const res = await callActivation(org.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().stage).toBe("THREE_DAYS");

    const row = await getActivationRow(db, org.id);
    expect(row).toBeDefined();
    expect(row?.returnedAfterThreeDaysAt).not.toBeNull();
  });

  test("returning after 7 days → returnedAfterSevenDaysAt is set", async () => {
    const db = getDb();
    const org = await createOrgWithAdmin(db, daysAgo(10));
    await db(TableName.UserSecretActivation).insert({
      userId: seedData1.id,
      orgId: org.id,
      firstSecretCreatedAt: daysAgo(8),
      returnedAfterThreeDaysAt: daysAgo(5)
    });

    const res = await callActivation(org.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().stage).toBe("SEVEN_DAYS");

    const row = await getActivationRow(db, org.id);
    expect(row).toBeDefined();
    expect(row?.returnedAfterSevenDaysAt).not.toBeNull();
  });

  test("all activation stages already recorded → no activation shown", async () => {
    const db = getDb();
    const org = await createOrgWithAdmin(db, daysAgo(10));
    await db(TableName.UserSecretActivation).insert({
      userId: seedData1.id,
      orgId: org.id,
      firstSecretCreatedAt: daysAgo(8),
      returnedAfterThreeDaysAt: daysAgo(5),
      returnedAfterSevenDaysAt: daysAgo(1)
    });

    const res = await callActivation(org.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.shouldShowActivation).toBe(false);
    expect(body.stage).toBeNull();
  });
});
