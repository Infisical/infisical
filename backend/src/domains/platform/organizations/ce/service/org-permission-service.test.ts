import { randomUUID } from "node:crypto";

import { packRules } from "@casl/ability/extra";

import { AccessScope, OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import type { TActorContext, TActorOrg } from "@app/domains/lib/actor-context";
import { ActorMemo } from "@app/domains/lib/actor-memo";
import { buildAccessControlForTests } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import type { TUserPrincipal } from "@app/lib/auth/principal";

import { OrgPermission } from "./org-access";
import { OrgPermissionService } from "./org-permission-service";
import { OrgPermissionMemberActions, OrgPermissionSubjects } from "./permission/org-permission";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const createMember = { action: OrgPermissionMemberActions.Create, subject: OrgPermissionSubjects.Member } as const;

const setup = () => {
  const { service: accessControlDomain, inMemory } = buildAccessControlForTests();
  const service = new OrgPermissionService({ accessControlDomain, memo: new ActorMemo<OrgPermission>() });
  const orgId = randomUUID();
  const userId = randomUUID();
  const org = (overrides: Partial<TActorOrg> = {}): TActorOrg => ({
    id: orgId,
    name: "acme",
    rootOrgId: orgId,
    parentOrgId: orgId,
    shouldUseNewPrivilegeSystem: true,
    ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false },
    ...overrides
  });
  const actor = (principal: Partial<TUserPrincipal> = {}, orgOverrides: Partial<TActorOrg> = {}): TActorContext => ({
    principal: {
      type: ActorType.USER,
      id: userId,
      username: "u",
      email: "u@example.com",
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false,
      ...principal
    },
    org: org(orgOverrides),
    plan: async () => {
      throw new Error("not needed");
    }
  });
  const addOrgRole = (role: string, customRoleId?: string) =>
    inMemory!.transactionRunner.run(({ dataAccess }) =>
      dataAccess.memberships.create({
        scope: AccessScope.Organization,
        scopeOrgId: orgId,
        actorUserId: userId,
        roles: [{ role, customRoleId }]
      })
    );
  const addCustomRole = (permissions: unknown) =>
    inMemory!.transactionRunner.run(({ dataAccess }) =>
      dataAccess.roles.create({ orgId, name: "Inviter", slug: "inviter", permissions })
    );
  return { service, actor, addOrgRole, addCustomRole, orgId };
};

describe("OrgPermissionService.getOrgPermission", () => {
  test("should let an org admin create members and refuse an org member", async () => {
    // Setup
    const admin = setup();
    await admin.addOrgRole(OrgMembershipRole.Admin);
    const member = setup();
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

  test("should apply a custom role's own rules", async () => {
    // Setup
    const { service, actor, addOrgRole, addCustomRole } = setup();
    const role = await addCustomRole(packRules([{ action: OrgPermissionMemberActions.Create, subject: "member" }]));
    await addOrgRole(OrgMembershipRole.Custom, role.id);

    // Action
    const permission = await service.getOrgPermission({ actor: actor() });

    // Assert
    expect(permission.can(createMember)).toBe(true);
    expect(permission.hasRole({ slug: "inviter" })).toBe(true);
  });

  test("should refuse an actor with no membership in the org", async () => {
    // Setup
    const { service, actor, orgId } = setup();

    // Action
    const result = service.getOrgPermission({ actor: actor() });

    // Assert
    await expect(result).rejects.toThrow(`You are not a member of this organization with ID ${orgId}`);
  });

  test("should refuse an org other than the one the session is scoped to", async () => {
    // Setup
    const { service, actor, addOrgRole } = setup();
    await addOrgRole(OrgMembershipRole.Admin);

    // Action
    const result = service.getOrgPermission({ actor: actor(), orgId: randomUUID() });

    // Assert
    await expect(result).rejects.toThrow("belongs to a different organization");
  });

  test("should refuse a sub-org for a parent-only operation and a root org for a child-only one", async () => {
    // Setup
    const { service, actor, addOrgRole } = setup();
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
    const { service, actor, addOrgRole } = setup();
    await addOrgRole("ghost");

    // Action
    const result = service.getOrgPermission({ actor: actor() });

    // Assert
    await expect(result).rejects.toThrow("Organization role 'ghost' not found");
  });

  test("should leave an admin's delegated OAuth token with nothing at the org level", async () => {
    // Setup
    const { service, actor, addOrgRole } = setup();
    await addOrgRole(OrgMembershipRole.Admin);

    // Action
    const permission = await service.getOrgPermission({
      actor: actor({ oauth: { clientId: "client", scopes: ["secrets:read"] } })
    });

    // Assert
    expect(permission.can(createMember)).toBe(false);
  });

  test("should refuse a machine principal that is neither a user nor an identity", async () => {
    // Setup
    const { service, actor } = setup();
    const context = { ...actor(), principal: { type: ActorType.GATEWAY as const, id: randomUUID() } };

    // Action
    const result = service.getOrgPermission({ actor: context });

    // Assert
    await expect(result).rejects.toThrow("Invalid actor provided");
  });

  test("should build the permission once for repeated checks in the same request", async () => {
    // Setup
    const { service, actor, addOrgRole } = setup();
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
});
