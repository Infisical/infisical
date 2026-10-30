import crypto from "node:crypto";

import { AccessScope, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { EmailDomainStatus } from "@app/ee/services/email-domain/email-domain-types";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

const ORG_ID = seedData1.organization.id;
const PROJECT_ID = seedData1.project.id;
const MAIL_DOMAIN = "mail.example.local";
const UPN_DOMAIN = "upn.example.local";

let identityToken = "";
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

const mailbox = () => `p-${crypto.randomUUID()}@${MAIL_DOMAIN}`;
const upn = () => `m${crypto.randomInt(100000, 999999)}@${UPN_DOMAIN}`;

const seedUser = async (username: string, overrides: Record<string, unknown> = {}) => {
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, isAccepted: true, isGhost: false, authMethods: ["email"], ...overrides })
    .returning("*");
  createdUserIds.push(user.id);
  return user;
};

const seedAlias = (opts: {
  userId: string;
  externalId: string;
  orgId?: string | null;
  aliasType?: UserAliasType;
}) =>
  testDb(TableName.UserAliases).insert({
    userId: opts.userId,
    externalId: opts.externalId,
    orgId: opts.orgId === undefined ? ORG_ID : opts.orgId,
    aliasType: opts.aliasType ?? UserAliasType.OIDC,
    isEmailVerified: true
  });

const seedMembership = async (userId: string, scope: AccessScope) => {
  const [m] = await testDb(TableName.Membership)
    .insert({
      scope,
      actorUserId: userId,
      scopeOrgId: ORG_ID,
      scopeProjectId: scope === AccessScope.Project ? PROJECT_ID : null,
      isActive: true,
      status: scope === AccessScope.Organization ? OrgMembershipStatus.Accepted : null
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: m.id, role: "member" });
  return m;
};

const findUser = (username: string) =>
  testDb(TableName.Users).where({ username }).select("id", "username", "email", "isAccepted").first();
const requireUser = async (username: string) => {
  const user = await findUser(username);
  if (!user) throw new Error(`expected a user with username '${username}'`);
  return user;
};
const usersByEmail = (email: string) => testDb(TableName.Users).where({ email }).select("id");
const orgMemberships = (userId: string) =>
  testDb(TableName.Membership).where({ actorUserId: userId, scopeOrgId: ORG_ID, scope: AccessScope.Organization });
const projectMemberships = (userId: string) =>
  testDb(TableName.Membership).where({ actorUserId: userId, scopeProjectId: PROJECT_ID, scope: AccessScope.Project });

// The customer's entitlement system authenticates as a machine identity, which is also the only way
// to reach these routes once the org enforces SSO: an email-login JWT is refused org-scoped access.
const asIdentity = (method: "POST" | "DELETE", body: object) =>
  testServer.inject({
    method,
    url: `/api/v1/projects/${PROJECT_ID}/memberships`,
    headers: { authorization: `Bearer ${identityToken}` },
    body
  });

const addToProject = (usernames: string[]) => asIdentity("POST", { usernames, emails: [], roleSlugs: ["member"] });
const removeFromProject = (usernames: string[]) => asIdentity("DELETE", { usernames, emails: [] });
const readMembership = (username: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/projects/${PROJECT_ID}/memberships/details`,
    headers: { authorization: `Bearer ${identityToken}` },
    body: { username }
  });

const inviteToOrg = (inviteeEmails: string[], projectIds?: string[]) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/invite-org/signup",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { inviteeEmails, organizationId: ORG_ID, ...(projectIds ? { projectIds } : {}) }
  });

const setAuthEnforced = (value: boolean) =>
  testDb(TableName.Organization).where({ id: ORG_ID }).update({ authEnforced: value });

describe("SSO identifier provisioning", () => {
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

    for await (const domain of [MAIL_DOMAIN, UPN_DOMAIN]) {
      await testDb(TableName.EmailDomains).insert({
        orgId: ORG_ID,
        domain,
        status: EmailDomainStatus.Verified,
        verificationCode: crypto.randomUUID(),
        verificationRecordName: `_infisical.${domain}`,
        codeExpiresAt: new Date(Date.now() + 86_400_000)
      });
    }
  });

  afterAll(async () => {
    await testDb(TableName.EmailDomains).where({ orgId: ORG_ID }).whereIn("domain", [MAIL_DOMAIN, UPN_DOMAIN]).del();
  });

  afterEach(async () => {
    await setAuthEnforced(false);
    if (createdUserIds.length) {
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
    if (createdOrgIds.length) {
      await testDb(TableName.Organization).whereIn("id", createdOrgIds).del();
      createdOrgIds.length = 0;
    }
  });

  describe("machine identity provisions a project, org enforces SSO", () => {
    beforeEach(() => setAuthEnforced(true));

    test("an IdP identifier resolves through the SSO alias, no second account", async () => {
      const identifier = upn();
      const user = await seedUser(mailbox());
      await seedAlias({ userId: user.id, externalId: identifier });

      expect((await addToProject([identifier])).statusCode).toBe(200);

      await expect(findUser(identifier)).resolves.toBeUndefined();
      await expect(projectMemberships(user.id)).resolves.toHaveLength(1);
      await expect(orgMemberships(user.id)).resolves.toHaveLength(1);
    });

    test("the same person named by email and identifier lands one membership", async () => {
      const email = mailbox();
      const identifier = upn();
      const user = await seedUser(email);
      await seedAlias({ userId: user.id, externalId: identifier });

      expect((await asIdentity("POST", { emails: [email], usernames: [identifier], roleSlugs: ["member"] })).statusCode).toBe(200);

      await expect(projectMemberships(user.id)).resolves.toHaveLength(1);
    });

    test("SAML and LDAP aliases resolve too", async () => {
      const samlId = upn();
      const ldapId = upn();
      const samlUser = await seedUser(mailbox());
      const ldapUser = await seedUser(mailbox());
      await seedAlias({ userId: samlUser.id, externalId: samlId, aliasType: UserAliasType.SAML });
      await seedAlias({ userId: ldapUser.id, externalId: ldapId, aliasType: UserAliasType.LDAP });

      expect((await addToProject([samlId, ldapId])).statusCode).toBe(200);

      await expect(findUser(samlId)).resolves.toBeUndefined();
      await expect(findUser(ldapId)).resolves.toBeUndefined();
      await expect(projectMemberships(samlUser.id)).resolves.toHaveLength(1);
      await expect(projectMemberships(ldapUser.id)).resolves.toHaveLength(1);
    });

    test("an unknown identifier falls through to a placeholder", async () => {
      const identifier = upn();

      expect((await addToProject([identifier])).statusCode).toBe(200);

      const shadow = await requireUser(identifier);
      expect(shadow).toMatchObject({ email: identifier, isAccepted: false });
      createdUserIds.push(shadow.id);
    });

    test("removal accepts the identifier the caller provisioned with", async () => {
      const identifier = upn();
      const user = await seedUser(mailbox());
      await seedAlias({ userId: user.id, externalId: identifier });
      await seedMembership(user.id, AccessScope.Project);

      expect((await removeFromProject([identifier])).statusCode).toBe(200);

      await expect(projectMemberships(user.id)).resolves.toHaveLength(0);
    });

    test("removal tolerates the same person named twice", async () => {
      const email = mailbox();
      const identifier = upn();
      const user = await seedUser(email);
      await seedAlias({ userId: user.id, externalId: identifier });
      await seedMembership(user.id, AccessScope.Project);

      expect((await asIdentity("DELETE", { emails: [email], usernames: [identifier] })).statusCode).toBe(200);

      await expect(projectMemberships(user.id)).resolves.toHaveLength(0);
    });

    test("removal still rejects someone who is not a member", async () => {
      const identifier = upn();
      const user = await seedUser(mailbox());
      await seedAlias({ userId: user.id, externalId: identifier });

      expect((await removeFromProject([identifier])).statusCode).toBe(400);
    });

    test("membership read-back works by identifier", async () => {
      const identifier = upn();
      const user = await seedUser(mailbox());
      await seedAlias({ userId: user.id, externalId: identifier });
      await seedMembership(user.id, AccessScope.Project);

      const res = await readMembership(identifier);

      expect(res.statusCode).toBe(200);
      expect(res.json().membership.user.id).toBe(user.id);
    });
  });

  describe("resolution boundaries", () => {
    beforeEach(() => setAuthEnforced(true));

    const expectsNoResolve = async (identifier: string, userId: string) => {
      expect((await addToProject([identifier])).statusCode).toBe(200);
      const shadow = await requireUser(identifier);
      createdUserIds.push(shadow.id);
      await expect(projectMemberships(userId)).resolves.toHaveLength(0);
    };

    test("an alias in another org does not resolve", async () => {
      const identifier = upn();
      const user = await seedUser(mailbox());
      const [otherOrg] = await testDb(TableName.Organization)
        .insert({ name: "other", slug: `other-${crypto.randomUUID()}` })
        .returning("*");
      createdOrgIds.push(otherOrg.id);
      await seedAlias({ userId: user.id, externalId: identifier, orgId: otherOrg.id });

      await expectsNoResolve(identifier, user.id);
    });

    test("a global social alias does not resolve", async () => {
      const identifier = upn();
      const user = await seedUser(mailbox());
      await seedAlias({ userId: user.id, externalId: identifier, orgId: null, aliasType: UserAliasType.GOOGLE });

      await expectsNoResolve(identifier, user.id);
    });

    test("a differently-cased identifier does not resolve", async () => {
      const identifier = upn();
      const user = await seedUser(mailbox());
      await seedAlias({ userId: user.id, externalId: identifier.toUpperCase() });

      await expectsNoResolve(identifier, user.id);
    });

    test("a ghost user is never reachable by an identifier", async () => {
      const identifier = upn();
      const ghost = await seedUser(mailbox(), { isGhost: true });
      await seedAlias({ userId: ghost.id, externalId: identifier });

      await expectsNoResolve(identifier, ghost.id);
    });

    test("an identifier reaching two accounts is rejected rather than guessed", async () => {
      const identifier = upn();
      const a = await seedUser(mailbox());
      const b = await seedUser(mailbox());
      await seedAlias({ userId: a.id, externalId: identifier });
      await seedAlias({ userId: b.id, externalId: identifier });

      const res = await addToProject([identifier]);

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain(identifier);
      await expect(findUser(identifier)).resolves.toBeUndefined();
    });
  });

  // The majority of installs have no SSO at all. Nothing here should touch the alias path, and the
  // failure messages a plain org already gets must not change shape.
  describe("org with no SSO configured", () => {
    test("a plain email invite behaves exactly as before", async () => {
      const email = `plain-${crypto.randomUUID()}@no-sso.example`;

      expect((await inviteToOrg([email])).statusCode).toBe(200);

      const user = await requireUser(email);
      expect(user).toMatchObject({ username: email, email, isAccepted: false });
      createdUserIds.push(user.id);
      await expect(orgMemberships(user.id)).resolves.toHaveLength(1);
    });

    test("a non-email identifier still fails with the original validation error", async () => {
      const res = await asIdentity("POST", { usernames: ["not-an-email-at-all"], emails: [], roleSlugs: ["member"] });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("Invalid emails");
    });

    test("removing someone who was never a member still fails the same way", async () => {
      const res = await removeFromProject([`ghost-${crypto.randomUUID()}@no-sso.example`]);

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("not part of project");
    });

    test("membership read-back for an unknown user still 404s", async () => {
      const res = await readMembership(`nobody-${crypto.randomUUID()}@no-sso.example`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe("org invite by a user session, enforcement off", () => {
    test("a new person still gets a placeholder keyed on their email", async () => {
      const email = mailbox();

      expect((await inviteToOrg([email])).statusCode).toBe(200);

      const user = await requireUser(email);
      expect(user).toMatchObject({ email, isAccepted: false });
      createdUserIds.push(user.id);
      await expect(orgMemberships(user.id)).resolves.toHaveLength(1);
    });

    test("an existing member resolves by username and gains no duplicate", async () => {
      const email = mailbox();
      const user = await seedUser(email);
      await seedMembership(user.id, AccessScope.Organization);

      expect((await inviteToOrg([email])).statusCode).toBe(200);

      await expect(orgMemberships(user.id)).resolves.toHaveLength(1);
      await expect(usersByEmail(email)).resolves.toHaveLength(1);
    });

    test("an identifier resolves through the alias and can carry a project grant", async () => {
      const identifier = upn();
      const user = await seedUser(mailbox());
      await seedAlias({ userId: user.id, externalId: identifier });

      expect((await inviteToOrg([identifier], [PROJECT_ID])).statusCode).toBe(200);

      await expect(findUser(identifier)).resolves.toBeUndefined();
      await expect(projectMemberships(user.id)).resolves.toHaveLength(1);
    });
  });
});
