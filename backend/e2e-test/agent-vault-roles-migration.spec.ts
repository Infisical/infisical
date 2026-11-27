import { randomUUID } from "node:crypto";

import { createAgentVaultProject } from "e2e-test/testUtils/agent-vault";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";

import { down, up } from "@app/db/migrations/20261118120000_agent-vault-roles-replace-bundle-grants";
import { AccessScope, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { findAgentVaultMemberRole } from "@app/ee/services/agent-vault-member/agent-vault-member-role-fns";
import { slugSchema } from "@app/server/lib/schemas";
import { TRoleDALFactory } from "@app/services/role/role-dal";

type TRoleRow = { membershipId: string; role: string; customRoleId: string | null; temporaryAccessEndTime: Date | null };

// Every role but admin used to resolve to Member's rules in an Agent Vault project, and bundle access came from grants.
// The migration has to leave every member able to do what they could before, through roles. The shared database already
// ran it, so each test seeds rows the way the old code wrote them and runs it again.
describe("Migration: Agent Vault roles replace bundle grants", () => {
  let cleanupOrg: () => Promise<void>;
  let orgId: string;
  let authToken: string;
  let projectId: string;

  const addIdentity = async (role: string, extra: Partial<TRoleRow> = {}, inProjectId = projectId) => {
    const [identity] = (await testDb(TableName.Identity)
      .insert({ name: `av-migration-${randomUUID().slice(0, 8)}`, orgId })
      .returning("id")) as { id: string }[];
    await testDb(TableName.Membership).insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorIdentityId: identity.id,
      isActive: true
    });
    const [membership] = (await testDb(TableName.Membership)
      .insert({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: inProjectId,
        actorIdentityId: identity.id,
        isActive: true
      })
      .returning("id")) as { id: string }[];
    await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role, ...extra });
    return { identityId: identity.id, membershipId: membership.id };
  };

  const addBundle = async (name: string, inProjectId = projectId) => {
    const [bundle] = (await testDb(TableName.AgentVaultAccessBundle)
      .insert({ projectId: inProjectId, name })
      .returning("id")) as { id: string }[];
    return bundle.id;
  };

  // A grant as the old code wrote it: a resource-scoped membership on the bundle with the consumer role.
  const grant = async (
    accessBundleId: string,
    actor: { actorIdentityId?: string; actorGroupId?: string },
    isActive = true,
    inProjectId = projectId
  ) => {
    const [membership] = (await testDb(TableName.Membership)
      .insert({
        scope: "resource",
        scopeOrgId: orgId,
        scopeProjectId: inProjectId,
        scopeResourceType: "agent-vault-access-bundle",
        scopeResourceId: accessBundleId,
        isActive,
        ...actor
      })
      .returning("id")) as { id: string }[];
    await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role: "consumer" });
  };

  const rolesOf = (membershipId: string) =>
    testDb(TableName.MembershipRole).where({ membershipId }).select("role", "customRoleId", "temporaryAccessEndTime") as Promise<
      TRoleRow[]
    >;

  // The Member role as the app finds it: by the id derived from the project's, whatever its slug.
  const memberRoleOf = async (inProjectId: string) =>
    (await findAgentVaultMemberRole(
      { findById: (id: string) => testDb(TableName.Role).where({ id }).first() } as unknown as Pick<
        TRoleDALFactory,
        "findById"
      >,
      inProjectId
    )) as { id: string; slug: string };

  const grantRoleIdOf = async (accessBundleId: string) =>
    ((await testDb(TableName.AgentVaultAccessBundle).where({ id: accessBundleId }).first()) as { grantRoleId: string })
      .grantRoleId;

  beforeAll(async () => {
    const org = await createIsolatedOrgAndProject("av-roles-migration");
    orgId = org.orgId;
    authToken = org.authToken;
    cleanupOrg = org.cleanup;
    projectId = await createAgentVaultProject({ authToken: org.authToken, name: `av-roles-migration-${Date.now()}` });
  });

  afterAll(async () => {
    await cleanupOrg();
  });

  test("every role but admin moves onto the Member role, and grants become bundle roles", async () => {
    const endsAt = new Date(Date.now() + 86_400_000);
    const member = await addIdentity(ProjectMembershipRole.Member, {
      isTemporary: true,
      temporaryMode: "relative",
      temporaryRange: "1d",
      temporaryAccessStartTime: new Date(),
      temporaryAccessEndTime: endsAt
    } as Partial<TRoleRow>);
    const viewer = await addIdentity(ProjectMembershipRole.Viewer);
    const noAccess = await addIdentity(ProjectMembershipRole.NoAccess);
    const cryptographicOperator = await addIdentity(ProjectMembershipRole.KmsCryptographicOperator);
    // A custom row that names no role, which the generic routes could write.
    const roleless = await addIdentity(ProjectMembershipRole.Custom);
    const admin = await addIdentity(ProjectMembershipRole.Admin);
    // A custom role whose own rules never applied: it resolved to Member's.
    const [legacyCustom] = (await testDb(TableName.Role)
      .insert({
        projectId,
        name: "Legacy",
        slug: `legacy-${randomUUID().slice(0, 8)}`,
        permissions: JSON.stringify([["issue-token", "agent-vault-proxies"]])
      })
      .returning("id")) as { id: string }[];
    const customOnly = await addIdentity(ProjectMembershipRole.Custom, { customRoleId: legacyCustom.id });
    // A time-limited member who also held a custom role for good.
    const memberAndCustom = await addIdentity(ProjectMembershipRole.Member, {
      isTemporary: true,
      temporaryMode: "relative",
      temporaryRange: "1d",
      temporaryAccessStartTime: new Date(),
      temporaryAccessEndTime: endsAt
    } as Partial<TRoleRow>);
    await testDb(TableName.MembershipRole).insert({
      membershipId: memberAndCustom.membershipId,
      role: ProjectMembershipRole.Custom,
      customRoleId: legacyCustom.id
    });

    const [group] = (await testDb(TableName.Groups)
      .insert({ orgId, name: "av-migration-group", slug: `av-migration-group-${randomUUID().slice(0, 8)}` })
      .returning("id")) as { id: string }[];
    const [groupMembership] = (await testDb(TableName.Membership)
      .insert({ scope: AccessScope.Project, scopeOrgId: orgId, scopeProjectId: projectId, actorGroupId: group.id, isActive: true })
      .returning("id")) as { id: string }[];
    await testDb(TableName.MembershipRole).insert({ membershipId: groupMembership.id, role: ProjectMembershipRole.Member });

    const granted = await addBundle(`granted-${randomUUID().slice(0, 8)}`);
    const onlyInactive = await addBundle(`inactive-${randomUUID().slice(0, 8)}`);
    await grant(granted, { actorIdentityId: member.identityId });
    await grant(granted, { actorIdentityId: noAccess.identityId });
    await grant(granted, { actorGroupId: group.id });
    await grant(onlyInactive, { actorIdentityId: viewer.identityId }, false);

    await up(testDb);

    const memberRole = (await testDb(TableName.Role).where({ projectId, slug: "member-role" }).first()) as {
      id: string;
      permissions: unknown;
    };
    expect(memberRole).toBeDefined();
    const { grantRoleId } = (await testDb(TableName.AgentVaultAccessBundle).where({ id: granted }).first()) as {
      grantRoleId: string;
    };
    const bundleRole = (await testDb(TableName.Role).where({ id: grantRoleId }).first()) as { slug: string; permissions: unknown };
    expect(bundleRole.slug.endsWith("-users")).toBe(true);
    expect(JSON.stringify(bundleRole.permissions)).toContain(granted);

    // A time-limited Member row keeps its window. A bundle role from a grant is permanent, as a grant was: it stays until
    // it's revoked.
    expect(await rolesOf(member.membershipId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: ProjectMembershipRole.Custom, customRoleId: memberRole.id, temporaryAccessEndTime: endsAt }),
        expect.objectContaining({ role: ProjectMembershipRole.Custom, customRoleId: grantRoleId, temporaryAccessEndTime: null })
      ])
    );
    expect(await rolesOf(viewer.membershipId)).toEqual([
      expect.objectContaining({ role: ProjectMembershipRole.Custom, customRoleId: memberRole.id })
    ]);
    // A custom role's own rules start counting after this, so its holders move onto the Member role they had in effect,
    // and the role stays, held by no one.
    expect(await rolesOf(customOnly.membershipId)).toEqual([
      expect.objectContaining({ role: ProjectMembershipRole.Custom, customRoleId: memberRole.id, temporaryAccessEndTime: null })
    ]);
    expect(await testDb(TableName.Role).where({ id: legacyCustom.id })).toHaveLength(1);
    expect(await testDb(TableName.MembershipRole).where({ customRoleId: legacyCustom.id })).toHaveLength(0);
    // Its rows and the member's collapse to one Member row, the one that lasts.
    expect(await rolesOf(memberAndCustom.membershipId)).toEqual([
      expect.objectContaining({ role: ProjectMembershipRole.Custom, customRoleId: memberRole.id, temporaryAccessEndTime: null })
    ]);
    // No Access and any other built-in read as Member's rules too, so they move onto the Member role, and No Access never
    // ends up beside a bundle role.
    expect(await rolesOf(noAccess.membershipId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: ProjectMembershipRole.Custom, customRoleId: memberRole.id }),
        expect.objectContaining({ role: ProjectMembershipRole.Custom, customRoleId: grantRoleId })
      ])
    );
    expect(await rolesOf(noAccess.membershipId)).toHaveLength(2);
    for (const { membershipId } of [cryptographicOperator, roleless]) {
      // eslint-disable-next-line no-await-in-loop
      expect(await rolesOf(membershipId)).toEqual([
        expect.objectContaining({ role: ProjectMembershipRole.Custom, customRoleId: memberRole.id })
      ]);
    }
    expect(await rolesOf(admin.membershipId)).toEqual([expect.objectContaining({ role: ProjectMembershipRole.Admin })]);
    expect(await rolesOf(groupMembership.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ customRoleId: memberRole.id }),
        expect.objectContaining({ customRoleId: grantRoleId, temporaryAccessEndTime: null })
      ])
    );

    // An inactive grant gave no access, so its bundle gets a role that nobody holds.
    const inactiveBundle = (await testDb(TableName.AgentVaultAccessBundle).where({ id: onlyInactive }).first()) as {
      grantRoleId: string;
    };
    expect(inactiveBundle.grantRoleId).toBeTruthy();
    expect(await testDb(TableName.MembershipRole).where({ customRoleId: inactiveBundle.grantRoleId })).toHaveLength(0);
    expect(
      await testDb(TableName.Membership).where({ scope: "resource", scopeProjectId: projectId })
    ).toHaveLength(0);

    // Running it again finds nothing left to convert.
    const rowCount = async () =>
      (
        await testDb(TableName.MembershipRole).whereIn(
          "membershipId",
          testDb(TableName.Membership).where({ scopeProjectId: projectId }).select("id")
        )
      ).length;
    const before = await rowCount();
    const rolesBefore = (await testDb(TableName.Role).where({ projectId })).length;
    await up(testDb);
    expect(await rowCount()).toBe(before);
    expect((await testDb(TableName.Role).where({ projectId })).length).toBe(rolesBefore);
    expect(await grantRoleIdOf(granted)).toBe(grantRoleId);
    expect(await testDb(TableName.Role).where({ projectId, slug: "member-role" })).toHaveLength(1);
  });

  test("a member granted more bundles than a member can hold roles gets a role for each", async () => {
    const holder = await addIdentity(ProjectMembershipRole.Member);
    const bundles = await Promise.all(
      Array.from({ length: 12 }, (_, index) => addBundle(`many-${index}-${randomUUID().slice(0, 8)}`))
    );
    await Promise.all(bundles.map((bundle) => grant(bundle, { actorIdentityId: holder.identityId })));

    await up(testDb);

    // No grant is dropped to fit the limit the app keeps when it gives roles: losing one would lose access.
    const memberRole = await memberRoleOf(projectId);
    const grantRoleIds = await Promise.all(bundles.map(grantRoleIdOf));
    expect((await rolesOf(holder.membershipId)).map((row) => row.customRoleId).sort()).toEqual(
      [memberRole.id, ...grantRoleIds].sort()
    );
  });

  test("a role slug that's taken gets a suffix, and a name cut to fit leaves no hyphen before the suffix", async () => {
    // A project of its own, so its Member role is made here, next to a role that already has the Member role's slug.
    const slugProjectId = await createAgentVaultProject({ authToken, name: `av-roles-migration-slugs-${Date.now()}` });
    const [takenMemberSlug] = (await testDb(TableName.Role)
      .insert({ projectId: slugProjectId, name: "Member role", slug: "member-role", permissions: JSON.stringify([]) })
      .returning("id")) as { id: string }[];
    const holder = await addIdentity(ProjectMembershipRole.Custom, { customRoleId: takenMemberSlug.id }, slugProjectId);

    const takenName = `taken-${randomUUID().slice(0, 8)}`;
    await testDb(TableName.Role).insert({
      projectId: slugProjectId,
      name: "Taken",
      slug: `${takenName}-users`,
      permissions: JSON.stringify([])
    });
    const taken = await addBundle(takenName, slugProjectId);
    // 64 characters with a hyphen right where the name is cut to make room for the suffix.
    const longName = `${"a".repeat(57)}-${"b".repeat(6)}`;
    const long = await addBundle(longName, slugProjectId);
    await grant(taken, { actorIdentityId: holder.identityId }, true, slugProjectId);
    await grant(long, { actorIdentityId: holder.identityId }, true, slugProjectId);

    await up(testDb);

    const slugOf = async (roleId: string) =>
      ((await testDb(TableName.Role).where({ id: roleId }).first()) as { slug: string }).slug;
    expect(await slugOf(await grantRoleIdOf(taken))).toBe(`${takenName}-users-2`);
    const longSlug = await slugOf(await grantRoleIdOf(long));
    expect(longSlug).toBe(`${"a".repeat(57)}-users`);
    expect(slugSchema().safeParse(longSlug).success).toBe(true);

    // The Member role takes another slug, and the app still finds it by the id derived from the project's.
    const memberRole = await memberRoleOf(slugProjectId);
    expect(memberRole.slug).toBe("member-role-2");
    expect(await rolesOf(holder.membershipId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ customRoleId: memberRole.id })])
    );
    expect(await testDb(TableName.MembershipRole).where({ customRoleId: takenMemberSlug.id })).toHaveLength(0);
  });

  test("a group's bundle role lasts only as long as its grant counted, while the group held a live role", async () => {
    const windowEndingAt = (endsAt: Date) =>
      ({
        isTemporary: true,
        temporaryMode: "relative",
        temporaryRange: "1d",
        temporaryAccessStartTime: new Date(endsAt.getTime() - 86_400_000),
        temporaryAccessEndTime: endsAt
      }) as Partial<TRoleRow>;
    const addGroup = async (window: Partial<TRoleRow> = {}) => {
      const suffix = randomUUID().slice(0, 8);
      const [group] = (await testDb(TableName.Groups)
        .insert({ orgId, name: `av-migration-group-${suffix}`, slug: `av-migration-group-${suffix}` })
        .returning("id")) as { id: string }[];
      const [membership] = (await testDb(TableName.Membership)
        .insert({ scope: AccessScope.Project, scopeOrgId: orgId, scopeProjectId: projectId, actorGroupId: group.id, isActive: true })
        .returning("id")) as { id: string }[];
      await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role: ProjectMembershipRole.Member, ...window });
      return { groupId: group.id, membershipId: membership.id };
    };
    const endsAt = new Date(Date.now() + 86_400_000);
    const [permanent, timed, ended] = [
      await addGroup(),
      await addGroup(windowEndingAt(endsAt)),
      await addGroup(windowEndingAt(new Date(Date.now() - 3_600_000)))
    ];
    const bundle = await addBundle(`group-window-${randomUUID().slice(0, 8)}`);
    await Promise.all([permanent, timed, ended].map((group) => grant(bundle, { actorGroupId: group.groupId })));

    await up(testDb);
    const grantRoleId = await grantRoleIdOf(bundle);
    const bundleRoleOf = async (membershipId: string) =>
      (await rolesOf(membershipId)).filter((row) => row.customRoleId === grantRoleId);

    expect(await bundleRoleOf(permanent.membershipId)).toEqual([expect.objectContaining({ temporaryAccessEndTime: null })]);
    expect(await bundleRoleOf(timed.membershipId)).toEqual([expect.objectContaining({ temporaryAccessEndTime: endsAt })]);
    // Its role had ended, so its grant gave nothing.
    expect(await bundleRoleOf(ended.membershipId)).toEqual([]);

    // A grant can't carry the time-limited group's end time, and would count for as long as any role the group holds, so
    // only the permanent group's comes back.
    await down(testDb);
    const grantedTo = (
      (await testDb(TableName.Membership)
        .where({ scope: "resource", scopeResourceId: bundle })
        .select("actorGroupId")) as { actorGroupId: string }[]
    ).map((row) => row.actorGroupId);
    expect(grantedTo).toEqual([permanent.groupId]);

    // Back to the migrated shape, which the specs after this one run on.
    await up(testDb);
  });

  test("down() turns bundle roles back into grants for who holds them for good now, leaving each member a role", async () => {
    const memberEndsAt = new Date(Date.now() + 86_400_000);
    const [active, revoked, ended, timed, assigned, bundleOnly, endedOnly, timedOnly, timedMember] = [
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.NoAccess),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member, {
        isTemporary: true,
        temporaryMode: "relative",
        temporaryRange: "1d",
        temporaryAccessStartTime: new Date(),
        temporaryAccessEndTime: memberEndsAt
      } as Partial<TRoleRow>)
    ];
    const bundle = await addBundle(`round-trip-${randomUUID().slice(0, 8)}`);
    const narrowed = await addBundle(`narrowed-${randomUUID().slice(0, 8)}`);
    const denied = await addBundle(`denied-${randomUUID().slice(0, 8)}`);
    await Promise.all(
      [active, revoked, ended, timed].map((holder) => grant(bundle, { actorIdentityId: holder.identityId }))
    );
    await grant(narrowed, { actorIdentityId: active.identityId });
    await grant(denied, { actorIdentityId: active.identityId });
    await up(testDb);
    const grantRoleId = await grantRoleIdOf(bundle);
    // An admin edits two other bundles' roles: one no longer allows use, and one saves a deny on its bundle before an
    // allow on every bundle, which the app orders after the allow, so the deny wins.
    await testDb(TableName.Role)
      .where({ id: await grantRoleIdOf(narrowed) })
      .update({ permissions: JSON.stringify([["read", "agent-vault-access-bundles", { accessBundleId: narrowed }]]) });
    await testDb(TableName.Role)
      .where({ id: await grantRoleIdOf(denied) })
      .update({
        permissions: JSON.stringify([
          ["use", "agent-vault-access-bundles", { accessBundleId: denied }, 1],
          ["read,use", "agent-vault-access-bundles"]
        ])
      });

    // Revoked after the upgrade.
    await testDb(TableName.MembershipRole).where({ membershipId: revoked.membershipId, customRoleId: grantRoleId }).delete();
    // Given for a time through the generic routes: one over, one still running.
    const makeTemporary = (membershipId: string, endsAt: Date) =>
      testDb(TableName.MembershipRole).where({ membershipId, customRoleId: grantRoleId }).update({
        isTemporary: true,
        temporaryMode: "relative",
        temporaryRange: "1h",
        temporaryAccessStartTime: new Date(endsAt.getTime() - 3_600_000),
        temporaryAccessEndTime: endsAt
      });
    await makeTemporary(ended.membershipId, new Date(Date.now() - 3_600_000));
    await makeTemporary(timed.membershipId, new Date(Date.now() + 3_600_000));
    // Given after the upgrade, with no grant before it.
    await testDb(TableName.MembershipRole).insert({
      membershipId: assigned.membershipId,
      role: ProjectMembershipRole.Custom,
      customRoleId: grantRoleId
    });
    // Given after the upgrade as a member's only role: for good, and for a time that's over and one still running.
    const endedAt = new Date(Date.now() - 3_600_000);
    const timedEndsAt = new Date(Date.now() + 3_600_000);
    for (const only of [bundleOnly, endedOnly, timedOnly]) {
      // eslint-disable-next-line no-await-in-loop
      await testDb(TableName.MembershipRole).where({ membershipId: only.membershipId }).delete();
      // eslint-disable-next-line no-await-in-loop
      await testDb(TableName.MembershipRole).insert({
        membershipId: only.membershipId,
        role: ProjectMembershipRole.Custom,
        customRoleId: grantRoleId
      });
    }
    await makeTemporary(endedOnly.membershipId, endedAt);
    await makeTemporary(timedOnly.membershipId, timedEndsAt);

    await down(testDb);
    const grantedTo = (
      (await testDb(TableName.Membership)
        .where({ scope: "resource", scopeResourceId: bundle })
        .select("actorIdentityId")) as { actorIdentityId: string }[]
    ).map((row) => row.actorIdentityId);
    expect(grantedTo.sort()).toEqual([active.identityId, assigned.identityId, bundleOnly.identityId].sort());
    // A role that no longer allows use gives no grant back.
    for (const bundleId of [narrowed, denied]) {
      // eslint-disable-next-line no-await-in-loop
      expect(await testDb(TableName.Membership).where({ scope: "resource", scopeResourceId: bundleId })).toHaveLength(0);
    }
    // A membership needs a role, and Member is what the old rules read every role but admin as. It lasts as long as the
    // bundle role did, an ended one included, which the old rules ignore too.
    expect(await rolesOf(bundleOnly.membershipId)).toMatchObject([
      { role: ProjectMembershipRole.Member, customRoleId: null, temporaryAccessEndTime: null }
    ]);
    expect(await rolesOf(endedOnly.membershipId)).toMatchObject([
      { role: ProjectMembershipRole.Member, customRoleId: null, temporaryAccessEndTime: endedAt }
    ]);
    expect(await rolesOf(timedOnly.membershipId)).toMatchObject([
      { role: ProjectMembershipRole.Member, customRoleId: null, temporaryAccessEndTime: timedEndsAt }
    ]);
    // Member role rows go back to the built-in role, keeping their windows.
    expect(await rolesOf(active.membershipId)).toMatchObject([
      { role: ProjectMembershipRole.Member, customRoleId: null, temporaryAccessEndTime: null }
    ]);
    expect(await rolesOf(timedMember.membershipId)).toMatchObject([
      { role: ProjectMembershipRole.Member, customRoleId: null, temporaryAccessEndTime: memberEndsAt }
    ]);

    // Back to the migrated shape, which the specs after this one run on.
    await up(testDb);
    expect(await testDb(TableName.MembershipRole).where({ customRoleId: await grantRoleIdOf(bundle) })).toHaveLength(3);
  });
});
