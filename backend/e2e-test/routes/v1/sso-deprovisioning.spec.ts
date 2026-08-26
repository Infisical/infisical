import crypto from "node:crypto";

import { AccessScope, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

const ORG_ID = seedData1.organization.id;
const PROJECT_ID = seedData1.project.id;
const UPN_DOMAIN = "upn.example.local";

let identityToken = "";
const createdUserIds: string[] = [];
const createdGroupIds: string[] = [];
const createdOrgIds: string[] = [];

const mailbox = () => `p-${crypto.randomUUID()}@mail.example.local`;
const upn = () => `m${crypto.randomInt(100000, 999999)}@${UPN_DOMAIN}`;

/** A member with an SSO alias whose externalId is a UPN, mirroring the customer's shape. */
const seedAliasedMember = async (opts: { externalId: string; aliasOrgId?: string | null } & { email?: string }) => {
  const email = opts.email ?? mailbox();
  const [user] = await testDb(TableName.Users)
    .insert({ username: email, email, isAccepted: true, isGhost: false, authMethods: ["email"] })
    .returning("*");
  createdUserIds.push(user.id);

  await testDb(TableName.UserAliases).insert({
    userId: user.id,
    externalId: opts.externalId,
    orgId: opts.aliasOrgId === undefined ? ORG_ID : opts.aliasOrgId,
    aliasType: UserAliasType.OIDC,
    isEmailVerified: true
  });

  const [orgM] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      actorUserId: user.id,
      scopeOrgId: ORG_ID,
      isActive: true,
      status: OrgMembershipStatus.Accepted
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: orgM.id, role: "member" });

  return user;
};

const giveDirectProjectMembership = async (userId: string) => {
  const [m] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Project,
      actorUserId: userId,
      scopeOrgId: ORG_ID,
      scopeProjectId: PROJECT_ID,
      isActive: true
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: m.id, role: "member" });
  return m;
};

const giveProjectKey = (userId: string) =>
  testDb(TableName.ProjectKeys).insert({
    projectId: PROJECT_ID,
    receiverId: userId,
    encryptedKey: "encrypted",
    nonce: "nonce"
  });

/** Puts the user in a group that is itself a member of the project. */
const giveGroupProjectAccess = async (userId: string) => {
  const [group] = await testDb(TableName.Groups)
    .insert({ orgId: ORG_ID, name: `g-${crypto.randomUUID()}`, slug: `g-${crypto.randomUUID()}` })
    .returning("*");
  createdGroupIds.push(group.id);
  await testDb(TableName.UserGroupMembership).insert({ userId, groupId: group.id, isPending: false });
  const [m] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Project,
      actorGroupId: group.id,
      scopeOrgId: ORG_ID,
      scopeProjectId: PROJECT_ID,
      isActive: true
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: m.id, role: "member" });
  return group;
};

const projectMemberships = (userId: string) =>
  testDb(TableName.Membership).where({ actorUserId: userId, scopeProjectId: PROJECT_ID, scope: AccessScope.Project });
const projectKeys = (userId: string) =>
  testDb(TableName.ProjectKeys).where({ receiverId: userId, projectId: PROJECT_ID });
const aliasesFor = (userId: string) => testDb(TableName.UserAliases).where({ userId });

const removeFromProject = (body: { usernames?: string[]; emails?: string[] }) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/${PROJECT_ID}/memberships`,
    headers: { authorization: `Bearer ${identityToken}` },
    body: { usernames: body.usernames ?? [], emails: body.emails ?? [] }
  });

describe("SSO identifier de-provisioning", () => {
  beforeAll(async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/universal-auth/login",
      body: {
        clientId: seedData1.machineIdentity.clientCredentials.id,
        clientSecret: seedData1.machineIdentity.clientCredentials.secret
      }
    });
    expect(res.statusCode).toBe(200);
    identityToken = res.json().accessToken as string;
  });

  afterEach(async () => {
    if (createdUserIds.length) {
      await testDb(TableName.ProjectKeys).whereIn("receiverId", createdUserIds).del();
      await testDb(TableName.UserGroupMembership).whereIn("userId", createdUserIds).del();
      const ids = await testDb(TableName.Membership)
        .whereIn("actorUserId", createdUserIds)
        .select("id")
        .then((r) => r.map((x) => x.id));
      if (ids.length) await testDb(TableName.MembershipRole).whereIn("membershipId", ids).del();
      await testDb(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
      await testDb(TableName.UserAliases).whereIn("userId", createdUserIds).del();
      await testDb(TableName.UserEncryptionKey).whereIn("userId", createdUserIds).del();
      await testDb(TableName.Users).whereIn("id", createdUserIds).del();
      createdUserIds.length = 0;
    }
    if (createdGroupIds.length) {
      const ids = await testDb(TableName.Membership)
        .whereIn("actorGroupId", createdGroupIds)
        .select("id")
        .then((r) => r.map((x) => x.id));
      if (ids.length) await testDb(TableName.MembershipRole).whereIn("membershipId", ids).del();
      await testDb(TableName.Membership).whereIn("actorGroupId", createdGroupIds).del();
      await testDb(TableName.UserGroupMembership).whereIn("groupId", createdGroupIds).del();
      await testDb(TableName.Groups).whereIn("id", createdGroupIds).del();
      createdGroupIds.length = 0;
    }
    if (createdOrgIds.length) {
      await testDb(TableName.Organization).whereIn("id", createdOrgIds).del();
      createdOrgIds.length = 0;
    }
  });

  describe("removal by IdP identifier", () => {
    test("removes the aliased member's project membership", async () => {
      const identifier = upn();
      const user = await seedAliasedMember({ externalId: identifier });
      await giveDirectProjectMembership(user.id);

      expect((await removeFromProject({ usernames: [identifier] })).statusCode).toBe(200);

      await expect(projectMemberships(user.id)).resolves.toHaveLength(0);
    });

    test("removes the project key of a member with no other access", async () => {
      const identifier = upn();
      const user = await seedAliasedMember({ externalId: identifier });
      await giveDirectProjectMembership(user.id);
      await giveProjectKey(user.id);

      expect((await removeFromProject({ usernames: [identifier] })).statusCode).toBe(200);

      await expect(projectKeys(user.id)).resolves.toHaveLength(0);
    });

    // The regression this guards: the group lookup keys on users.username, so removal must resolve
    // the identifier before consulting it. Feeding it the raw UPN would match nothing and strip the
    // project key of someone who still reaches the project through their group.
    test("PRESERVES the project key when the member still has group access", async () => {
      const identifier = upn();
      const user = await seedAliasedMember({ externalId: identifier });
      await giveDirectProjectMembership(user.id);
      await giveProjectKey(user.id);
      await giveGroupProjectAccess(user.id);

      expect((await removeFromProject({ usernames: [identifier] })).statusCode).toBe(200);

      await expect(projectMemberships(user.id)).resolves.toHaveLength(0);
      await expect(projectKeys(user.id)).resolves.toHaveLength(1);
    });

    test("removal by email behaves identically for a group member", async () => {
      const email = mailbox();
      const user = await seedAliasedMember({ externalId: upn(), email });
      await giveDirectProjectMembership(user.id);
      await giveProjectKey(user.id);
      await giveGroupProjectAccess(user.id);

      expect((await removeFromProject({ emails: [email] })).statusCode).toBe(200);

      await expect(projectKeys(user.id)).resolves.toHaveLength(1);
    });

    test("naming one person by both email and identifier removes them once", async () => {
      const email = mailbox();
      const identifier = upn();
      const user = await seedAliasedMember({ externalId: identifier, email });
      await giveDirectProjectMembership(user.id);

      expect((await removeFromProject({ emails: [email], usernames: [identifier] })).statusCode).toBe(200);

      await expect(projectMemberships(user.id)).resolves.toHaveLength(0);
    });

    test("removes several members named by a mix of emails and identifiers", async () => {
      const emailUser = await seedAliasedMember({ externalId: upn() });
      const upnIdentifier = upn();
      const upnUser = await seedAliasedMember({ externalId: upnIdentifier });
      await giveDirectProjectMembership(emailUser.id);
      await giveDirectProjectMembership(upnUser.id);

      const res = await removeFromProject({ emails: [emailUser.username], usernames: [upnIdentifier] });

      expect(res.statusCode).toBe(200);
      await expect(projectMemberships(emailUser.id)).resolves.toHaveLength(0);
      await expect(projectMemberships(upnUser.id)).resolves.toHaveLength(0);
    });

    test("deletes the member's additional privileges", async () => {
      const identifier = upn();
      const user = await seedAliasedMember({ externalId: identifier });
      await giveDirectProjectMembership(user.id);
      await testDb(TableName.AdditionalPrivilege).insert({
        actorUserId: user.id,
        projectId: PROJECT_ID,
        name: `priv-${crypto.randomUUID()}`,
        permissions: JSON.stringify([])
      });

      expect((await removeFromProject({ usernames: [identifier] })).statusCode).toBe(200);

      await expect(
        testDb(TableName.AdditionalPrivilege).where({ actorUserId: user.id, projectId: PROJECT_ID })
      ).resolves.toHaveLength(0);
    });
  });

  describe("removal refuses to act on a partial or ambiguous match", () => {
    test("a member plus a non-member removes nobody", async () => {
      const identifier = upn();
      const member = await seedAliasedMember({ externalId: identifier });
      await giveDirectProjectMembership(member.id);
      const strangerId = upn();
      const stranger = await seedAliasedMember({ externalId: strangerId });

      const res = await removeFromProject({ usernames: [identifier, strangerId] });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("not part of project");
      // The whole request is rejected, so the real member keeps their access.
      await expect(projectMemberships(member.id)).resolves.toHaveLength(1);
      await expect(projectMemberships(stranger.id)).resolves.toHaveLength(0);
    });

    test("an identifier reaching two accounts removes nobody", async () => {
      const identifier = upn();
      const a = await seedAliasedMember({ externalId: identifier });
      const b = await seedAliasedMember({ externalId: identifier });
      await giveDirectProjectMembership(a.id);
      await giveDirectProjectMembership(b.id);

      const res = await removeFromProject({ usernames: [identifier] });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain(identifier);
      await expect(projectMemberships(a.id)).resolves.toHaveLength(1);
      await expect(projectMemberships(b.id)).resolves.toHaveLength(1);
    });

    test("an alias belonging to another org removes nobody", async () => {
      const identifier = upn();
      const [otherOrg] = await testDb(TableName.Organization)
        .insert({ name: "other", slug: `other-${crypto.randomUUID()}` })
        .returning("*");
      createdOrgIds.push(otherOrg.id);
      const user = await seedAliasedMember({ externalId: identifier, aliasOrgId: otherOrg.id });
      await giveDirectProjectMembership(user.id);

      const res = await removeFromProject({ usernames: [identifier] });

      expect(res.statusCode).toBe(400);
      await expect(projectMemberships(user.id)).resolves.toHaveLength(1);
    });

    test("a global social alias removes nobody", async () => {
      const identifier = upn();
      const user = await seedAliasedMember({ externalId: identifier, aliasOrgId: null });
      await testDb(TableName.UserAliases)
        .where({ userId: user.id })
        .update({ aliasType: UserAliasType.GOOGLE, orgId: null });
      await giveDirectProjectMembership(user.id);

      const res = await removeFromProject({ usernames: [identifier] });

      expect(res.statusCode).toBe(400);
      await expect(projectMemberships(user.id)).resolves.toHaveLength(1);
    });
  });

  describe("org membership removal reaps the org-scoped alias", () => {
    test("deleting an org membership deletes that org's alias", async () => {
      const user = await seedAliasedMember({ externalId: upn() });
      expect(await aliasesFor(user.id)).toHaveLength(1);
      const [orgMembership] = await testDb(TableName.Membership).where({
        actorUserId: user.id,
        scopeOrgId: ORG_ID,
        scope: AccessScope.Organization
      });

      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v2/organizations/${ORG_ID}/memberships/${orgMembership.id}`,
        headers: { authorization: `Bearer ${identityToken}` }
      });

      expect(res.statusCode).toBe(200);
      await expect(aliasesFor(user.id)).resolves.toHaveLength(0);
    });
  });
});
