import crypto from "node:crypto";

import { AccessScope, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { EmailDomainStatus } from "@app/ee/services/email-domain/email-domain-types";
import { AuthMethod } from "@app/services/auth/auth-type";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

// Services live inside the encapsulated route plugin, so e2e reaches them through the harness global
// that routes/index.ts sets when NODE_ENV=test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const services = () => (globalThis as any).testServices;

const ORG_ID = seedData1.organization.id;
const DOMAIN = "login.example.local";

const createdUserIds: string[] = [];

const mailbox = () => `p-${crypto.randomUUID()}@${DOMAIN}`;
const identifier = () => `m${crypto.randomInt(100000, 999999)}@${DOMAIN}`;

const oidcLogin = (opts: { externalId: string; email: string }) =>
  services().oidc.oidcLogin({
    externalId: opts.externalId,
    email: opts.email,
    firstName: "Test",
    lastName: "User",
    orgId: ORG_ID,
    ip: "127.0.0.1",
    userAgent: "vitest",
    manageGroupMemberships: false
  });

const socialLogin = (opts: { email: string; providerUserId: string; authMethod?: AuthMethod }) =>
  services().login.oauth2Login({
    email: opts.email,
    firstName: "Social",
    lastName: "User",
    authMethod: opts.authMethod ?? AuthMethod.GOOGLE,
    providerUserId: opts.providerUserId,
    isEmailVerifiedByProvider: true,
    ip: "127.0.0.1",
    userAgent: "vitest"
  });

const seedUser = async (username: string, overrides: Record<string, unknown> = {}) => {
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, isAccepted: false, isGhost: false, authMethods: ["email"], ...overrides })
    .returning("*");
  createdUserIds.push(user.id);
  return user;
};

const seedOrgMembership = async (userId: string) => {
  const [m] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      actorUserId: userId,
      scopeOrgId: ORG_ID,
      isActive: true,
      status: OrgMembershipStatus.Invited
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: m.id, role: "member" });
};

const findUser = (username: string) =>
  testDb(TableName.Users).where({ username }).select("id", "username", "email", "isAccepted").first();
const requireUser = async (username: string) => {
  const u = await findUser(username);
  if (!u) throw new Error(`expected user '${username}'`);
  return u;
};
const usersByEmail = (email: string) => testDb(TableName.Users).where({ email }).select("id");
const aliases = (userId: string) => testDb(TableName.UserAliases).where({ userId });

describe("SSO login paths and social login interaction", () => {
  beforeAll(async () => {
    await testDb(TableName.EmailDomains).insert({
      orgId: ORG_ID,
      domain: DOMAIN,
      status: EmailDomainStatus.Verified,
      verificationCode: crypto.randomUUID(),
      verificationRecordName: `_infisical.${DOMAIN}`,
      codeExpiresAt: new Date(Date.now() + 86_400_000)
    });
    await testDb(TableName.Organization).where({ id: ORG_ID }).update({ authEnforced: true });
  });

  afterAll(async () => {
    await testDb(TableName.Organization).where({ id: ORG_ID }).update({ authEnforced: false });
    await testDb(TableName.EmailDomains).where({ orgId: ORG_ID, domain: DOMAIN }).del();
  });

  afterEach(async () => {
    if (!createdUserIds.length) return;
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
  });

  describe("OIDC login", () => {
    test("JIT creates one user plus an alias holding the asserted identifier", async () => {
      const email = mailbox();
      const externalId = identifier();

      const result = await oidcLogin({ externalId, email });

      const user = await requireUser(email);
      createdUserIds.push(user.id);
      expect(result.userId).toBe(user.id);
      const [alias] = await aliases(user.id);
      expect(alias.externalId).toBe(externalId);
      expect(alias.emails).toEqual([email]);
    });

    test("a second login reuses the alias and creates nothing", async () => {
      const email = mailbox();
      const externalId = identifier();
      await oidcLogin({ externalId, email });
      const first = await requireUser(email);
      createdUserIds.push(first.id);

      await oidcLogin({ externalId, email });

      await expect(usersByEmail(email)).resolves.toHaveLength(1);
      expect(await aliases(first.id)).toHaveLength(1);
    });

    test("adopts a placeholder provisioned under the identifier, keeping its access", async () => {
      const email = mailbox();
      const externalId = identifier();
      const placeholder = await seedUser(externalId);
      await seedOrgMembership(placeholder.id);

      await oidcLogin({ externalId, email });

      await expect(findUser(externalId)).resolves.toBeUndefined();
      const adopted = await requireUser(email);
      expect(adopted.id).toBe(placeholder.id);
      await expect(usersByEmail(email)).resolves.toHaveLength(1);
    });

    test("attaches to a placeholder invited by email without adopting", async () => {
      const email = mailbox();
      const invited = await seedUser(email);
      await seedOrgMembership(invited.id);

      await oidcLogin({ externalId: identifier(), email });

      const same = await requireUser(email);
      expect(same.id).toBe(invited.id);
      await expect(usersByEmail(email)).resolves.toHaveLength(1);
    });

    test.each([
      ["already accepted", { isAccepted: true }],
      ["email verified", { isEmailVerified: true }],
      ["holds a password", { hashedPassword: "x" }],
      ["is a ghost", { isGhost: true }]
    ])("refuses to adopt a placeholder that is %s", async (_label, overrides) => {
      const email = mailbox();
      const externalId = identifier();
      const placeholder = await seedUser(externalId, overrides);
      await seedOrgMembership(placeholder.id);

      await oidcLogin({ externalId, email });

      // Placeholder untouched, and the login got its own account instead.
      await expect(findUser(externalId)).resolves.toMatchObject({ id: placeholder.id });
      const fresh = await requireUser(email);
      expect(fresh.id).not.toBe(placeholder.id);
      createdUserIds.push(fresh.id);
    });

    test("refuses to adopt a placeholder with no membership in this org", async () => {
      const email = mailbox();
      const externalId = identifier();
      const placeholder = await seedUser(externalId);

      await oidcLogin({ externalId, email });

      await expect(findUser(externalId)).resolves.toMatchObject({ id: placeholder.id });
      const fresh = await requireUser(email);
      expect(fresh.id).not.toBe(placeholder.id);
      createdUserIds.push(fresh.id);
    });
  });

  describe("social login is unaffected", () => {
    test("an existing user with a social alias logs in on that alias", async () => {
      const email = mailbox();
      const providerUserId = `g-${crypto.randomUUID()}`;
      const user = await seedUser(email, { isAccepted: true, isEmailVerified: true });
      await testDb(TableName.UserAliases).insert({
        userId: user.id,
        externalId: providerUserId,
        orgId: null,
        aliasType: UserAliasType.GOOGLE,
        isEmailVerified: true
      });

      const result = await socialLogin({ email, providerUserId });

      expect(result.user.id).toBe(user.id);
      await expect(usersByEmail(email)).resolves.toHaveLength(1);
      expect(await aliases(user.id)).toHaveLength(1);
    });

    test("a user bound to a social provider is never adopted by an org's OIDC login", async () => {
      const email = mailbox();
      const externalId = identifier();
      const placeholder = await seedUser(externalId);
      await seedOrgMembership(placeholder.id);
      await testDb(TableName.UserAliases).insert({
        userId: placeholder.id,
        externalId: `g-${crypto.randomUUID()}`,
        orgId: null,
        aliasType: UserAliasType.GOOGLE,
        isEmailVerified: true
      });

      await oidcLogin({ externalId, email });

      // The social binding is what refuses the adoption, so the row keeps its identity.
      await expect(findUser(externalId)).resolves.toMatchObject({ id: placeholder.id });
      const fresh = await requireUser(email);
      expect(fresh.id).not.toBe(placeholder.id);
      createdUserIds.push(fresh.id);
    });

    test("a social login can still attach to an account that was adopted earlier", async () => {
      const email = mailbox();
      const externalId = identifier();
      const placeholder = await seedUser(externalId);
      await seedOrgMembership(placeholder.id);
      await oidcLogin({ externalId, email });
      const adopted = await requireUser(email);
      expect(adopted.id).toBe(placeholder.id);

      const providerUserId = `g-${crypto.randomUUID()}`;
      const result = await socialLogin({ email, providerUserId });

      expect(result.user.id).toBe(placeholder.id);
      await expect(usersByEmail(email)).resolves.toHaveLength(1);
      const rows = await aliases(placeholder.id);
      expect(rows.map((r) => r.aliasType).sort()).toEqual(["google", "oidc"]);
    });
  });
});
