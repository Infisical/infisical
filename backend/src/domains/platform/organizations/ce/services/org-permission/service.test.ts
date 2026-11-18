import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import { ActorContextMemo } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { buildAccessControl } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { PAST, TSeedActor } from "@app/domains/platform/access-control/ce/testing/grant-fixture";
import { ActorType } from "@app/lib/auth/actor-types";
import type { TUserPrincipal } from "@app/lib/auth/principal";

import {
  OrgPermissionIdentityActions,
  OrgPermissionMemberActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "../../models/org-permission-set";
import { actorContext, actorOrg, userPrincipal } from "../../testing/actor-context-fixture";
import { OrgPermissionService } from "./service";

type TOrgRule = TPermissionRule<OrgPermissionSet>;

const createMember = { action: OrgPermissionMemberActions.Create, subject: OrgPermissionSubjects.Member } as const;
const readMember = { action: OrgPermissionMemberActions.Read, subject: OrgPermissionSubjects.Member } as const;
const deleteMember = { action: OrgPermissionMemberActions.Delete, subject: OrgPermissionSubjects.Member } as const;

const arrange = () => {
  const { grantStore, actorGrantsService, roleService, seed } = buildAccessControl();
  const service = new OrgPermissionService(actorGrantsService, roleService, new ActorContextMemo());
  const org = actorOrg();
  const orgId = org.id;
  const userId = randomUUID();
  const actor = (principal: Partial<TUserPrincipal> = {}, orgOverrides: Parameters<typeof actorOrg>[0] = {}) =>
    actorContext({
      principal: userPrincipal({ id: userId, ...principal }),
      org: actorOrg({ ...org, ...orgOverrides })
    });
  const addOrgRole = (
    role: string,
    { customRoleId, who = { userId } }: { customRoleId?: string; who?: TSeedActor | { groupId: string } } = {}
  ) => seed.membership({ scope: AccessScope.Organization, orgId, actor: who, roles: [{ role, customRoleId }] });
  const addCustomRole = (rules: TOrgRule[], slug = `custom-${randomUUID()}`) =>
    seed.role({ owner: { orgId }, slug, permissions: packRules(rules) });
  return { service, grantStore, seed, actor, addOrgRole, addCustomRole, orgId, userId };
};

describe("OrgPermissionService.getOrgPermission", () => {
  test("should let an org admin create members and refuse an org member", async () => {
    // Setup
    const admin = arrange();
    await admin.addOrgRole(OrgMembershipRole.Admin);
    const member = arrange();
    await member.addOrgRole(OrgMembershipRole.Member);

    // Action
    const [adminPermission, memberPermission] = await Promise.all([
      admin.service.getOrgPermission({ actor: admin.actor() }),
      member.service.getOrgPermission({ actor: member.actor() })
    ]);

    // Assert
    expect(adminPermission.can(createMember)).toBe(true);
    expect(memberPermission.can(createMember)).toBe(false);
  });

  test("should apply a custom role's own rules and know it by its slug", async () => {
    // Setup
    const { service, actor, addOrgRole, addCustomRole } = arrange();
    const role = await addCustomRole([createMember], "inviter");
    await addOrgRole(OrgMembershipRole.Custom, { customRoleId: role.id });

    // Action
    const permission = await service.getOrgPermission({ actor: actor() });

    // Assert
    expect(permission.can(createMember)).toBe(true);
    expect(permission.hasRole({ slug: "inviter" })).toBe(true);
  });

  test("should apply a role held through a group", async () => {
    // Setup
    const { service, actor, addOrgRole, seed, orgId, userId } = arrange();
    const group = await seed.group({ orgId });
    await seed.groupMember({ groupId: group.id, userId });
    await addOrgRole(OrgMembershipRole.Admin, { who: { groupId: group.id } });

    // Action
    const permission = await service.getOrgPermission({ actor: actor() });

    // Assert
    expect(permission.can(createMember)).toBe(true);
  });

  test("should refuse an actor with no membership in the org with the legacy message", async () => {
    // Setup
    const { service, actor, orgId } = arrange();

    // Action
    const result = service.getOrgPermission({ actor: actor() });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(result).rejects.toMatchObject({
      message: `You are not a member of this organization with ID ${orgId}. Please assign this user to the organization with the appropriate permissions, then try again.`,
      hasDefaultName: true
    });
  });

  test("should refuse an org other than the one the session is scoped to with the legacy message", async () => {
    // Setup
    const { service, actor, addOrgRole, orgId } = arrange();
    await addOrgRole(OrgMembershipRole.Admin);

    // Action
    const result = service.getOrgPermission({ actor: actor(), orgId: randomUUID() });

    // Assert
    await expect(result).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(result).rejects.toMatchObject({
      message: `Your token is scoped to organization with ID ${orgId}, but this resource belongs to a different organization.`,
      hasDefaultName: true
    });
  });

  test("should refuse a sub-org for a parent-only operation and a root org for a child-only one", async () => {
    // Setup
    const { service, actor, addOrgRole } = arrange();
    await addOrgRole(OrgMembershipRole.Admin);

    // Action
    const asSubOrg = service.getOrgPermission({
      actor: actor({}, { rootOrgId: randomUUID() }),
      scope: OrganizationActionScope.ParentOrganization
    });
    const asRootOrg = service.getOrgPermission({ actor: actor(), scope: OrganizationActionScope.ChildOrganization });

    // Assert
    await expect(asSubOrg).rejects.toThrow("Child organization cannot do this operation");
    await expect(asRootOrg).rejects.toThrow("Parent organization cannot do this operation");
  });

  test("should refuse an org role slug it does not know", async () => {
    // Setup
    const { service, actor, addOrgRole } = arrange();
    await addOrgRole("ghost");

    // Action
    const result = service.getOrgPermission({ actor: actor() });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toMatchObject({
      name: "OrgRoleInvalid",
      message: "Organization role 'ghost' not found"
    });
  });

  test("should leave an admin's delegated OAuth token with nothing at the org level", async () => {
    // Setup
    const { service, actor, addOrgRole } = arrange();
    await addOrgRole(OrgMembershipRole.Admin);

    // Action
    const permission = await service.getOrgPermission({
      actor: actor({ oauth: { clientId: "client", scopes: ["secrets:read"] } })
    });

    // Assert
    expect(permission.can(readMember)).toBe(false);
  });

  test("should refuse a machine principal that is neither a user nor an identity", async () => {
    // Setup
    const { service, actor } = arrange();
    const context = { ...actor(), principal: { type: ActorType.GATEWAY as const, id: randomUUID() } };

    // Action
    const result = service.getOrgPermission({ actor: context });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow("Invalid actor provided");
  });

  test("should build the permission once for repeated checks with the same context", async () => {
    // Setup
    const { service, actor, addOrgRole } = arrange();
    await addOrgRole(OrgMembershipRole.Admin);
    const context = actor();

    // Action
    const [first, second] = await Promise.all([
      service.getOrgPermission({ actor: context }),
      service.getOrgPermission({ actor: context })
    ]);

    // Assert
    expect(second).toBe(first);
  });

  test("should build it again for a new context, so the next request sees a role change", async () => {
    // Setup
    const { service, actor, addOrgRole } = arrange();
    await addOrgRole(OrgMembershipRole.Member);
    await service.getOrgPermission({ actor: actor() });
    await addOrgRole(OrgMembershipRole.Admin);

    // Action
    const permission = await service.getOrgPermission({ actor: actor() });

    // Assert
    expect(permission.can(createMember)).toBe(true);
  });
});

describe("OrgPermissionService.canBypassSso", () => {
  test("should let a root org admin bypass and not a member", async () => {
    // Setup
    const admin = arrange();
    await admin.addOrgRole(OrgMembershipRole.Admin);
    const member = arrange();
    await member.addOrgRole(OrgMembershipRole.Member);

    // Action
    const [adminCan, memberCan] = await Promise.all([
      admin.service.canBypassSso({ userId: admin.userId, rootOrgId: admin.orgId }),
      member.service.canBypassSso({ userId: member.userId, rootOrgId: member.orgId })
    ]);

    // Assert
    expect(adminCan).toBe(true);
    expect(memberCan).toBe(false);
  });

  test("should refuse a user with no membership in the root org", async () => {
    // Setup
    const { service, userId } = arrange();

    // Action
    const can = await service.canBypassSso({ userId, rootOrgId: randomUUID() });

    // Assert
    expect(can).toBe(false);
  });
});

describe("OrgPermissionService.getOrgPermissionByRoles", () => {
  test("should give each built-in slug its rules and each custom slug its role", async () => {
    // Setup
    const { service, addCustomRole, orgId } = arrange();
    const role = await addCustomRole([createMember], "inviter");

    // Action
    const result = await service.getOrgPermissionByRoles({ orgId, roles: [OrgMembershipRole.Admin, "inviter"] });

    // Assert
    expect(result.map(({ role: found }) => found?.slug)).toEqual([undefined, "inviter"]);
    expect(result[0].permission.can(deleteMember)).toBe(true);
    expect(result[1].permission.can(createMember)).toBe(true);
    expect(result[1].role?.id).toBe(role.id);
  });

  test("should refuse a slug with no role, naming it, so assigning a role that does not exist fails", async () => {
    // Setup
    const { service, orgId } = arrange();

    // Action
    const result = service.getOrgPermissionByRoles({ orgId, roles: ["ssh-host-bootstrapper"] });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow(
      `Specified roles 'ssh-host-bootstrapper' was not found in the organization with ID '${orgId}'`
    );
  });

  test("should drop an unresolved slug when told to and keep the roles that resolve", async () => {
    // Setup
    const { service, orgId } = arrange();

    // Action
    const result = await service.getOrgPermissionByRoles({
      orgId,
      roles: [OrgMembershipRole.Admin, "ssh-host-bootstrapper"],
      ignoreUnresolvedRoles: true
    });

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].permission.can(deleteMember)).toBe(true);
  });

  test("should not resolve another org's custom role", async () => {
    // Setup
    const { service, addCustomRole } = arrange();
    await addCustomRole([createMember], "inviter");

    // Action
    const result = await service.getOrgPermissionByRoles({
      orgId: randomUUID(),
      roles: ["inviter"],
      ignoreUnresolvedRoles: true
    });

    // Assert
    expect(result).toEqual([]);
  });
});

describe("OrgPermissionService.getGrantPermissions", () => {
  const elevated: TOrgRule[] = [
    { action: OrgPermissionIdentityActions.EditAuth, subject: OrgPermissionSubjects.Identity }
  ];

  test("should return one permission per distinct active role, a group's included and no-access left out", async () => {
    // Setup
    const { service, seed, orgId, userId } = arrange();
    await seed.membership({
      scope: AccessScope.Organization,
      orgId,
      actor: { userId },
      roles: [{ role: OrgMembershipRole.Member }, { role: OrgMembershipRole.NoAccess }]
    });
    const group = await seed.group({ orgId });
    await seed.groupMember({ groupId: group.id, userId });
    await seed.membership({
      scope: AccessScope.Organization,
      orgId,
      actor: { groupId: group.id },
      roles: [{ role: OrgMembershipRole.Admin }, { role: OrgMembershipRole.Member }]
    });

    // Action
    const permissions = await service.getGrantPermissions({
      actor: { type: ActorType.USER, id: userId, name: "ada" },
      orgId
    });

    // Assert
    expect(permissions).toHaveLength(2);
  });

  test("should return an org privilege as a permission of its own", async () => {
    // Setup
    const { service, seed, addOrgRole, orgId, userId } = arrange();
    await addOrgRole(OrgMembershipRole.Member);
    await seed.privilege({ actor: { userId }, orgId, permissions: packRules(elevated) });

    // Action
    const permissions = await service.getGrantPermissions({
      actor: { type: ActorType.USER, id: userId, name: "ada" },
      orgId
    });

    // Assert
    expect(permissions).toHaveLength(2);
    expect(
      permissions.some((permission) =>
        permission.can({ action: OrgPermissionIdentityActions.EditAuth, subject: OrgPermissionSubjects.Identity })
      )
    ).toBe(true);
  });

  test("should leave out a temporary privilege that has ended", async () => {
    // Setup
    const { service, seed, grantStore, addOrgRole, orgId, userId } = arrange();
    await addOrgRole(OrgMembershipRole.Member);
    const privilege = await seed.privilege({ actor: { userId }, orgId, permissions: packRules(elevated) });
    grantStore.rows.privileges.set(privilege.id, {
      ...privilege,
      isTemporary: true,
      temporaryAccessEndTime: PAST()
    });

    // Action
    const permissions = await service.getGrantPermissions({
      actor: { type: ActorType.USER, id: userId, name: "ada" },
      orgId
    });

    // Assert
    expect(permissions).toHaveLength(1);
  });

  test("should fill the actor's name and metadata into a role's placeholders", async () => {
    // Setup
    const { service, seed, addOrgRole, addCustomRole, orgId, userId } = arrange();
    const role = await addCustomRole([
      { ...readMember, conditions: { team: "{{identity.metadata.team}}", name: "{{identity.username}}" } } as TOrgRule
    ]);
    await addOrgRole(OrgMembershipRole.Custom, { customRoleId: role.id });
    await seed.attribute({ orgId, actor: { userId }, key: "team", value: "payments" });

    // Action
    const [permission] = await service.getGrantPermissions({
      actor: { type: ActorType.USER, id: userId, name: "ada" },
      orgId
    });

    // Assert
    expect(permission.rules[0].conditions).toEqual({ team: "payments", name: "ada" });
  });
});
