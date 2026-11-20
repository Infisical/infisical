import { randomUUID } from "node:crypto";

import { createAgentVaultProject } from "e2e-test/testUtils/agent-vault";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";

import { down, up } from "@app/db/migrations/20261118120000_agent-vault-roles-replace-bundle-grants";
import { AccessScope, ProjectMembershipRole, TableName } from "@app/db/schemas";

type TRoleRow = { membershipId: string; role: string; customRoleId: string | null; temporaryAccessEndTime: Date | null };

// Every role but admin used to resolve to Member's rules in an Agent Vault project, and bundle access came from grants.
// The migration has to leave every member able to do what they could before, through roles. The shared database already
// ran it, so each test seeds rows the way the old code wrote them and runs it again.
describe("Migration: Agent Vault roles replace bundle grants", () => {
  let cleanupOrg: () => Promise<void>;
  let orgId: string;
  let projectId: string;

  const addIdentity = async (role: string, extra: Partial<TRoleRow> = {}) => {
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
        scopeProjectId: projectId,
        actorIdentityId: identity.id,
        isActive: true
      })
      .returning("id")) as { id: string }[];
    await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role, ...extra });
    return { identityId: identity.id, membershipId: membership.id };
  };

  const addBundle = async (name: string) => {
    const [bundle] = (await testDb(TableName.AgentVaultAccessBundle)
      .insert({ projectId, name })
      .returning("id")) as { id: string }[];
    return bundle.id;
  };

  // A grant as the old code wrote it: a resource-scoped membership on the bundle with the consumer role.
  const grant = async (accessBundleId: string, actor: { actorIdentityId?: string; actorGroupId?: string }, isActive = true) => {
    const [membership] = (await testDb(TableName.Membership)
      .insert({
        scope: "resource",
        scopeOrgId: orgId,
        scopeProjectId: projectId,
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

  const grantRoleIdOf = async (accessBundleId: string) =>
    ((await testDb(TableName.AgentVaultAccessBundle).where({ id: accessBundleId }).first()) as { grantRoleId: string })
      .grantRoleId;

  beforeAll(async () => {
    const org = await createIsolatedOrgAndProject("av-roles-migration");
    orgId = org.orgId;
    cleanupOrg = org.cleanup;
    projectId = await createAgentVaultProject({ authToken: org.authToken, name: `av-roles-migration-${Date.now()}` });
  });

  afterAll(async () => {
    await cleanupOrg();
  });

  test("member-like and custom rows move onto the Member role, and grants become bundle roles", async () => {
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
    expect(await rolesOf(noAccess.membershipId)).toEqual([expect.objectContaining({ role: ProjectMembershipRole.NoAccess })]);
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
    const [active, revoked, ended, timed, assigned, bundleOnly] = [
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.Member),
      await addIdentity(ProjectMembershipRole.NoAccess)
    ];
    const bundle = await addBundle(`round-trip-${randomUUID().slice(0, 8)}`);
    await Promise.all(
      [active, revoked, ended, timed].map((holder) => grant(bundle, { actorIdentityId: holder.identityId }))
    );
    await up(testDb);
    const grantRoleId = await grantRoleIdOf(bundle);

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
    // Given after the upgrade to a member with No Access, which the bundle role takes the place of.
    await testDb(TableName.MembershipRole).where({ membershipId: bundleOnly.membershipId }).delete();
    await testDb(TableName.MembershipRole).insert({
      membershipId: bundleOnly.membershipId,
      role: ProjectMembershipRole.Custom,
      customRoleId: grantRoleId
    });

    await down(testDb);
    const grantedTo = (
      (await testDb(TableName.Membership)
        .where({ scope: "resource", scopeResourceId: bundle })
        .select("actorIdentityId")) as { actorIdentityId: string }[]
    ).map((row) => row.actorIdentityId);
    expect(grantedTo.sort()).toEqual([active.identityId, assigned.identityId, bundleOnly.identityId].sort());
    // A membership needs a role, and Member is what the old rules read every role but admin as.
    expect(await rolesOf(bundleOnly.membershipId)).toMatchObject([
      { role: ProjectMembershipRole.Member, customRoleId: null }
    ]);

    // Back to the migrated shape, which the specs after this one run on.
    await up(testDb);
    expect(await testDb(TableName.MembershipRole).where({ customRoleId: await grantRoleIdOf(bundle) })).toHaveLength(3);
  });
});
