import crypto from "node:crypto";

import { TableName } from "@app/db/schemas";
import { AccessScope, OrgMembershipStatus } from "@app/db/schemas";
import { orgDALFactory } from "@app/services/org/org-dal";
import { userDALFactory } from "@app/services/user/user-dal";
import { userAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { adoptProvisionedShadowUser, resolveUsersBySsoExternalId } from "@app/services/user-alias/user-alias-fns";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

// Drives the resolver against real Postgres so the org scoping, the NULL-orgId semantics of whereIn,
// and the sub-org widening are all exercised as SQL rather than as reasoning.
const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

const makeOrg = async (rootOrgId?: string) => {
  const [org] = await testDb(TableName.Organization)
    .insert({ name: `o-${crypto.randomUUID()}`, slug: `o-${crypto.randomUUID()}`, rootOrgId: rootOrgId ?? null })
    .returning("*");
  createdOrgIds.push(org.id);
  return org;
};

const makeUserWithAlias = async (opts: {
  externalId: string;
  orgId: string | null;
  aliasType?: UserAliasType;
  isGhost?: boolean;
}) => {
  const email = `u-${crypto.randomUUID()}@tenant.example`;
  const [user] = await testDb(TableName.Users)
    .insert({ username: email, email, isAccepted: true, isGhost: opts.isGhost ?? false, authMethods: ["email"] })
    .returning("*");
  createdUserIds.push(user.id);
  await testDb(TableName.UserAliases).insert({
    userId: user.id,
    externalId: opts.externalId,
    orgId: opts.orgId,
    aliasType: opts.aliasType ?? UserAliasType.OIDC,
    isEmailVerified: true
  });
  return user;
};

const resolveAs = (orgId: string, identifiers: string[], rootOrgId?: string | null) =>
  resolveUsersBySsoExternalId({
    identifiers,
    orgId,
    rootOrgId,
    userAliasDAL: userAliasDALFactory(testDb),
    userDAL: userDALFactory(testDb)
  });

describe("SSO alias resolution is tenant scoped", () => {
  afterEach(async () => {
    if (createdUserIds.length) {
      const memberships = await testDb(TableName.Membership)
        .whereIn("actorUserId", createdUserIds)
        .select("id")
        .then((r) => r.map((x) => x.id));
      if (memberships.length) await testDb(TableName.MembershipRole).whereIn("membershipId", memberships).del();
      await testDb(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
      await testDb(TableName.UserAliases).whereIn("userId", createdUserIds).del();
      await testDb(TableName.Users).whereIn("id", createdUserIds).del();
      createdUserIds.length = 0;
    }
    if (createdOrgIds.length) {
      // children first so the self-referencing rootOrgId FK is satisfied
      await testDb(TableName.Organization).whereIn("id", createdOrgIds).whereNotNull("rootOrgId").del();
      await testDb(TableName.Organization).whereIn("id", createdOrgIds).del();
      createdOrgIds.length = 0;
    }
  });

  test("an identifier resolves inside its own org", async () => {
    const org = await makeOrg();
    const identifier = `id-${crypto.randomUUID()}`;
    const user = await makeUserWithAlias({ externalId: identifier, orgId: org.id });

    const { resolved } = await resolveAs(org.id, [identifier]);

    expect(resolved.get(identifier)?.id).toBe(user.id);
  });

  test("org A cannot resolve an identifier that belongs to org B", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const identifier = `id-${crypto.randomUUID()}`;
    await makeUserWithAlias({ externalId: identifier, orgId: orgB.id });

    const { resolved, ambiguousIdentifiers } = await resolveAs(orgA.id, [identifier]);

    expect(resolved.size).toBe(0);
    expect(ambiguousIdentifiers).toEqual([]);
  });

  test("a NULL-org social alias is unreachable from any org", async () => {
    const org = await makeOrg();
    const identifier = `id-${crypto.randomUUID()}`;
    await makeUserWithAlias({ externalId: identifier, orgId: null, aliasType: UserAliasType.GOOGLE });

    const { resolved } = await resolveAs(org.id, [identifier]);

    expect(resolved.size).toBe(0);
  });

  test("a NULL-org alias of an org-scoped type is still unreachable", async () => {
    const org = await makeOrg();
    const identifier = `id-${crypto.randomUUID()}`;
    await makeUserWithAlias({ externalId: identifier, orgId: null, aliasType: UserAliasType.OIDC });

    const { resolved } = await resolveAs(org.id, [identifier]);

    // whereIn("orgId", [...]) excludes NULL in SQL, which is the first of the two locks.
    expect(resolved.size).toBe(0);
  });

  test("a ghost user is never returned even when the alias is in scope", async () => {
    const org = await makeOrg();
    const identifier = `id-${crypto.randomUUID()}`;
    await makeUserWithAlias({ externalId: identifier, orgId: org.id, isGhost: true });

    const { resolved } = await resolveAs(org.id, [identifier]);

    expect(resolved.size).toBe(0);
  });

  test("only org-scoped alias types resolve; social types never do", async () => {
    const org = await makeOrg();
    const wanted = [UserAliasType.OIDC, UserAliasType.SAML, UserAliasType.LDAP];
    const refused = [UserAliasType.GOOGLE, UserAliasType.GITHUB, UserAliasType.GITLAB];
    const ids: Record<string, string> = {};
    for await (const aliasType of [...wanted, ...refused]) {
      const identifier = `id-${aliasType}-${crypto.randomUUID()}`;
      ids[aliasType] = identifier;
      // Give the social ones an orgId too, so aliasType is the only thing refusing them.
      await makeUserWithAlias({ externalId: identifier, orgId: org.id, aliasType });
    }

    const { resolved } = await resolveAs(
      org.id,
      Object.values(ids)
    );

    wanted.forEach((t) => expect(resolved.has(ids[t])).toBe(true));
    refused.forEach((t) => expect(resolved.has(ids[t])).toBe(false));
  });

  describe("sub-organizations", () => {
    test("a sub-org resolves an alias held on its root org", async () => {
      const root = await makeOrg();
      const sub = await makeOrg(root.id);
      const identifier = `id-${crypto.randomUUID()}`;
      const user = await makeUserWithAlias({ externalId: identifier, orgId: root.id });

      const { resolved } = await resolveAs(sub.id, [identifier], root.id);

      expect(resolved.get(identifier)?.id).toBe(user.id);
    });

    test("a root org cannot reach down into a sub-org's alias", async () => {
      const root = await makeOrg();
      const sub = await makeOrg(root.id);
      const identifier = `id-${crypto.randomUUID()}`;
      await makeUserWithAlias({ externalId: identifier, orgId: sub.id });

      // A root org has no rootOrgId of its own, so the widening never applies in this direction.
      const { resolved } = await resolveAs(root.id, [identifier], null);

      expect(resolved.size).toBe(0);
    });

    test("sibling sub-orgs cannot reach each other", async () => {
      const root = await makeOrg();
      const subA = await makeOrg(root.id);
      const subB = await makeOrg(root.id);
      const identifier = `id-${crypto.randomUUID()}`;
      await makeUserWithAlias({ externalId: identifier, orgId: subB.id });

      const { resolved } = await resolveAs(subA.id, [identifier], root.id);

      expect(resolved.size).toBe(0);
    });
  });

  // Adoption looks the placeholder up by username with no org filter, so the org-membership guard is
  // the only thing keeping it inside one tenant. These drive it against a real transaction.
  describe("placeholder adoption is bounded by org membership", () => {
    const seedPlaceholder = async (username: string, membershipOrgId?: string) => {
      const [user] = await testDb(TableName.Users)
        .insert({
          username,
          email: username,
          isAccepted: false,
          isEmailVerified: false,
          isGhost: false,
          authMethods: ["email"]
        })
        .returning("*");
      createdUserIds.push(user.id);
      if (membershipOrgId) {
        const [m] = await testDb(TableName.Membership)
          .insert({
            scope: AccessScope.Organization,
            actorUserId: user.id,
            scopeOrgId: membershipOrgId,
            isActive: true,
            status: OrgMembershipStatus.Invited
          })
          .returning("*");
        await testDb(TableName.MembershipRole).insert({ membershipId: m.id, role: "member" });
      }
      return user;
    };

    const adoptAs = (orgId: string, externalId: string, assertedEmail: string) =>
      testDb.transaction((tx) =>
        adoptProvisionedShadowUser({
          externalId,
          assertedEmail,
          orgId,
          userDAL: userDALFactory(testDb),
          userAliasDAL: userAliasDALFactory(testDb),
          orgDAL: orgDALFactory(testDb),
          tx
        })
      );

    test("org A cannot adopt a placeholder that only belongs to org B", async () => {
      const orgA = await makeOrg();
      const orgB = await makeOrg();
      const identifier = `ph-${crypto.randomUUID()}@tenant.example`;
      const placeholder = await seedPlaceholder(identifier, orgB.id);

      const adopted = await adoptAs(orgA.id, identifier, `real-${crypto.randomUUID()}@tenant.example`);

      expect(adopted).toBeNull();
      await expect(testDb(TableName.Users).where({ id: placeholder.id }).first()).resolves.toMatchObject({
        username: identifier
      });
    });

    test("a placeholder with no membership anywhere is never adopted", async () => {
      const org = await makeOrg();
      const identifier = `ph-${crypto.randomUUID()}@tenant.example`;
      const placeholder = await seedPlaceholder(identifier);

      const adopted = await adoptAs(org.id, identifier, `real-${crypto.randomUUID()}@tenant.example`);

      expect(adopted).toBeNull();
      await expect(testDb(TableName.Users).where({ id: placeholder.id }).first()).resolves.toMatchObject({
        username: identifier
      });
    });

    test("the org that provisioned the placeholder can adopt it", async () => {
      const org = await makeOrg();
      const identifier = `ph-${crypto.randomUUID()}@tenant.example`;
      const asserted = `real-${crypto.randomUUID()}@tenant.example`;
      const placeholder = await seedPlaceholder(identifier, org.id);

      const adopted = await adoptAs(org.id, identifier, asserted);

      expect(adopted?.id).toBe(placeholder.id);
      await expect(testDb(TableName.Users).where({ id: placeholder.id }).first()).resolves.toMatchObject({
        username: asserted,
        email: asserted
      });
    });
  });

  test("a batch resolves only the in-scope members of a mixed set", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const mine = `id-${crypto.randomUUID()}`;
    const theirs = `id-${crypto.randomUUID()}`;
    const social = `id-${crypto.randomUUID()}`;
    const mineUser = await makeUserWithAlias({ externalId: mine, orgId: orgA.id });
    await makeUserWithAlias({ externalId: theirs, orgId: orgB.id });
    await makeUserWithAlias({ externalId: social, orgId: null, aliasType: UserAliasType.GITHUB });

    const { resolved } = await resolveAs(orgA.id, [mine, theirs, social]);

    expect([...resolved.keys()]).toEqual([mine]);
    expect(resolved.get(mine)?.id).toBe(mineUser.id);
  });

  test("the same identifier in two orgs resolves to each org's own user, never the other's", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const identifier = `id-${crypto.randomUUID()}`;
    const userA = await makeUserWithAlias({ externalId: identifier, orgId: orgA.id });
    const userB = await makeUserWithAlias({ externalId: identifier, orgId: orgB.id });

    const fromA = await resolveAs(orgA.id, [identifier]);
    const fromB = await resolveAs(orgB.id, [identifier]);

    expect(fromA.resolved.get(identifier)?.id).toBe(userA.id);
    expect(fromB.resolved.get(identifier)?.id).toBe(userB.id);
    // Reused identifiers across tenants are not an ambiguity: each org sees only its own.
    expect(fromA.ambiguousIdentifiers).toEqual([]);
    expect(fromB.ambiguousIdentifiers).toEqual([]);
  });
});
