import crypto from "node:crypto";

import { AccessScope, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

const ORG_ID = seedData1.organization.id;

const createdUserIds: string[] = [];

const seedUser = async (username: string) => {
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, isAccepted: false, isGhost: false, authMethods: ["email"] })
    .returning("*");
  createdUserIds.push(user.id);
  return user;
};

const seedAlias = async ({
  userId,
  externalId,
  orgId = ORG_ID,
  aliasType = UserAliasType.OIDC
}: {
  userId: string;
  externalId: string;
  orgId?: string | null;
  aliasType?: UserAliasType;
}) => {
  await testDb(TableName.UserAliases).insert({ userId, externalId, orgId, aliasType });
};

const findUserByUsername = (username: string) =>
  testDb(TableName.Users).where({ username }).select("id", "username", "email").first();

const findOrgMemberships = (userId: string) =>
  testDb(TableName.Membership)
    .where({ actorUserId: userId, scopeOrgId: ORG_ID, scope: AccessScope.Organization })
    .select("id");

const PROJECT_ID = seedData1.project.id;

// Seeded directly instead of through the invite endpoint, since what's under test is identifier
// resolution on the removal path.
const seedProjectMembership = async (userId: string) => {
  const [membership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Project,
      actorUserId: userId,
      scopeOrgId: ORG_ID,
      scopeProjectId: PROJECT_ID,
      isActive: true
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role: "member" });
  return membership;
};

const removeFromProject = (usernames: string[]) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/${PROJECT_ID}/memberships`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { usernames, emails: [] }
  });

const findProjectMemberships = (userId: string) =>
  testDb(TableName.Membership)
    .where({ actorUserId: userId, scopeProjectId: PROJECT_ID, scope: AccessScope.Project })
    .select("id");

const inviteToOrg = (inviteeEmails: string[]) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/invite-org/signup",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { inviteeEmails, organizationId: ORG_ID }
  });

// A UPN is email-shaped, so it clears the route's validation and is indistinguishable from an email
// until we look it up. That's the case this suite covers.
const upn = () => `m${crypto.randomInt(100000, 999999)}@one.example.local`;
const mailbox = () => `person-${crypto.randomUUID()}@example.local`;

describe("Org invite by SSO alias identifier", () => {
  afterEach(async () => {
    if (!createdUserIds.length) return;
    const memberships = await testDb(TableName.Membership)
      .whereIn("actorUserId", createdUserIds)
      .select("id")
      .then((rows) => rows.map((row) => row.id));
    if (memberships.length) await testDb(TableName.MembershipRole).whereIn("membershipId", memberships).del();
    await testDb(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
    await testDb(TableName.UserAliases).whereIn("userId", createdUserIds).del();
    await testDb(TableName.Users).whereIn("id", createdUserIds).del();
    createdUserIds.length = 0;
  });

  test("an identifier recorded on an org SSO alias resolves to that user instead of creating a second account", async () => {
    const email = mailbox();
    const identifier = upn();
    const user = await seedUser(email);
    await seedAlias({ userId: user.id, externalId: identifier });

    const res = await inviteToOrg([identifier]);
    expect(res.statusCode).toBe(200);

    await expect(findUserByUsername(identifier)).resolves.toBeUndefined();
    await expect(findOrgMemberships(user.id)).resolves.toHaveLength(1);
  });

  test("naming the same person by both their email and their alias identifier yields one membership", async () => {
    const email = mailbox();
    const identifier = upn();
    const user = await seedUser(email);
    await seedAlias({ userId: user.id, externalId: identifier });

    const res = await inviteToOrg([email, identifier]);
    expect(res.statusCode).toBe(200);

    await expect(findOrgMemberships(user.id)).resolves.toHaveLength(1);
    await expect(findUserByUsername(identifier)).resolves.toBeUndefined();
  });

  test("an externalId stored with different case does not resolve", async () => {
    const identifier = upn();
    const user = await seedUser(mailbox());
    await seedAlias({ userId: user.id, externalId: identifier.toUpperCase() });

    const res = await inviteToOrg([identifier]);
    expect(res.statusCode).toBe(200);

    // externalId is case-sensitive, so a differently-cased identifier is a different subject. Since
    // the invite routes lowercase their input, an IdP asserting mixed-case identifiers can't be
    // provisioned against at all. Fixing that means relaxing those routes.
    await expect(findUserByUsername(identifier)).resolves.toMatchObject({ username: identifier });
    await expect(findOrgMemberships(user.id)).resolves.toHaveLength(0);

    const shadow = await findUserByUsername(identifier);
    if (shadow) createdUserIds.push(shadow.id);
  });

  test("an alias belonging to another organization does not resolve", async () => {
    const identifier = upn();
    const user = await seedUser(mailbox());
    const [otherOrg] = await testDb(TableName.Organization)
      .insert({ name: "other org", slug: `other-org-${crypto.randomUUID()}`, customerId: null })
      .returning("*");

    try {
      await seedAlias({ userId: user.id, externalId: identifier, orgId: otherOrg.id });

      const res = await inviteToOrg([identifier]);
      expect(res.statusCode).toBe(200);

      // Nothing in this org vouches for the identifier, so it's treated as a new person.
      await expect(findUserByUsername(identifier)).resolves.toMatchObject({ username: identifier });
      await expect(findOrgMemberships(user.id)).resolves.toHaveLength(0);

      const shadow = await findUserByUsername(identifier);
      if (shadow) createdUserIds.push(shadow.id);
    } finally {
      await testDb(TableName.Organization).where({ id: otherOrg.id }).del();
    }
  });

  test("a global social alias does not resolve, even when its externalId matches the identifier", async () => {
    const identifier = upn();
    const user = await seedUser(mailbox());
    // Social aliases are not org-scoped (orgId is NULL), so they must never vouch for an identifier.
    await seedAlias({ userId: user.id, externalId: identifier, orgId: null, aliasType: UserAliasType.GOOGLE });

    const res = await inviteToOrg([identifier]);
    expect(res.statusCode).toBe(200);

    await expect(findUserByUsername(identifier)).resolves.toMatchObject({ username: identifier });
    await expect(findOrgMemberships(user.id)).resolves.toHaveLength(0);

    const shadow = await findUserByUsername(identifier);
    if (shadow) createdUserIds.push(shadow.id);
  });

  test("a project membership can be removed by the alias identifier", async () => {
    const identifier = upn();
    const user = await seedUser(mailbox());
    await seedAlias({ userId: user.id, externalId: identifier });
    await seedProjectMembership(user.id);

    // Removal has to take the same identifier the caller provisioned with, or an entitlement system
    // can grant access it can never revoke.
    const res = await removeFromProject([identifier]);

    expect(res.statusCode).toBe(200);
    await expect(findProjectMemberships(user.id)).resolves.toHaveLength(0);
  });

  test("naming one person by both email and alias identifier does not break project removal", async () => {
    const email = mailbox();
    const identifier = upn();
    const user = await seedUser(email);
    await seedAlias({ userId: user.id, externalId: identifier });
    await seedProjectMembership(user.id);

    // Both forms collapse onto one membership, so the "some users are not part of project" count
    // check has to compare against the resolved set rather than the raw input.
    const res = await removeFromProject([email, identifier]);

    expect(res.statusCode).toBe(200);
    await expect(findProjectMemberships(user.id)).resolves.toHaveLength(0);
  });

  test("an identifier reaching two distinct accounts is rejected rather than guessed at", async () => {
    const identifier = upn();
    const first = await seedUser(mailbox());
    const second = await seedUser(mailbox());
    await seedAlias({ userId: first.id, externalId: identifier });
    await seedAlias({ userId: second.id, externalId: identifier });

    const res = await inviteToOrg([identifier]);

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain(identifier);
    await expect(findUserByUsername(identifier)).resolves.toBeUndefined();
  });
});
