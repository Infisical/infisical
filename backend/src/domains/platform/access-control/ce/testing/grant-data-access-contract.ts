import { AccessScope, OrgMembershipRole, ProjectMembershipRole, RESOURCE_SCOPE } from "@app/db/schemas";
import { ActorType } from "@app/lib/auth/actor-types";

import { TAccessControlDataAccess } from "../data-access/access-control-data-access";
import { TAccessControlDataAccessDeps } from "../module";

export type TGrantContractHarness = {
  build: () => Promise<TAccessControlDataAccessDeps>;
  // Platform rows Access Control does not own.
  newOrg: () => Promise<string>;
  newProject: (orgId: string) => Promise<string>;
  newUser: () => Promise<string>;
  newIdentity: (orgId: string) => Promise<string>;
};

const write = <T>(deps: TAccessControlDataAccessDeps, work: (dataAccess: TAccessControlDataAccess) => Promise<T>) =>
  deps.transactionRunner.run(({ dataAccess }) => work(dataAccess));

const projectMembership = (
  deps: TAccessControlDataAccessDeps,
  {
    orgId,
    projectId,
    actor,
    role = ProjectMembershipRole.Member,
    customRoleId,
    temporaryAccessEndTime
  }: {
    orgId: string;
    projectId: string;
    actor: { actorUserId: string } | { actorIdentityId: string } | { actorGroupId: string };
    role?: string;
    customRoleId?: string;
    temporaryAccessEndTime?: Date;
  }
) =>
  write(deps, (dataAccess) =>
    dataAccess.memberships.create({
      scope: AccessScope.Project,
      scopeOrgId: orgId,
      scopeProjectId: projectId,
      ...actor,
      roles: [
        {
          role,
          customRoleId,
          ...(temporaryAccessEndTime
            ? {
                isTemporary: true,
                temporaryMode: "relative",
                temporaryRange: "1h",
                temporaryAccessStartTime: new Date(0),
                temporaryAccessEndTime
              }
            : {})
        }
      ]
    })
  );

// What every GrantDataAccess, in memory or on Postgres, must do.
export const describeGrantDataAccessContract = (name: string, harness: () => TGrantContractHarness) => {
  const setup = async () => {
    const h = harness();
    const deps = await h.build();
    const orgId = await h.newOrg();
    const projectId = await h.newProject(orgId);
    const userId = await h.newUser();
    return { h, deps, orgId, projectId, userId };
  };

  describe(`GrantDataAccess contract (${name})`, () => {
    test("should return the user's direct project membership with its role", async () => {
      // Setup
      const { deps, orgId, projectId, userId } = await setup();
      await projectMembership(deps, { orgId, projectId, actor: { actorUserId: userId } });

      // Action
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.USER, id: userId },
        { scope: AccessScope.Project, orgId, projectId }
      );

      // Assert
      expect(grants.memberships).toHaveLength(1);
      expect(grants.memberships[0].roles.map((role) => role.role)).toEqual([ProjectMembershipRole.Member]);
    });

    test("should return nothing for an actor with no membership in the project", async () => {
      // Setup
      const { h, deps, orgId, projectId, userId } = await setup();
      const otherProjectId = await h.newProject(orgId);
      await projectMembership(deps, { orgId, projectId: otherProjectId, actor: { actorUserId: userId } });

      // Action
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.USER, id: userId },
        { scope: AccessScope.Project, orgId, projectId }
      );

      // Assert
      expect(grants.hasMembership).toBe(false);
    });

    test("should return a membership the user holds through a group", async () => {
      // Setup
      const { deps, orgId, projectId, userId } = await setup();
      const group = await write(deps, (dataAccess) =>
        dataAccess.groups.create({ orgId, name: "g", slug: `g-${projectId}` })
      );
      await write(deps, (dataAccess) => dataAccess.groups.addMembers(group.id, [{ userId }]));
      await projectMembership(deps, {
        orgId,
        projectId,
        actor: { actorGroupId: group.id },
        role: ProjectMembershipRole.Viewer
      });

      // Action
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.USER, id: userId },
        { scope: AccessScope.Project, orgId, projectId }
      );

      // Assert
      expect(grants.memberships.map((membership) => membership.viaGroupId)).toEqual([group.id]);
      expect(grants.hasActiveRole(ProjectMembershipRole.Viewer)).toBe(true);
    });

    test("should return a membership an identity holds through a group", async () => {
      // Setup
      const { h, deps, orgId, projectId } = await setup();
      const identityId = await h.newIdentity(orgId);
      const group = await write(deps, (dataAccess) =>
        dataAccess.groups.create({ orgId, name: "g", slug: `g-${projectId}` })
      );
      await write(deps, (dataAccess) => dataAccess.groups.addMembers(group.id, [{ identityId }]));
      await projectMembership(deps, { orgId, projectId, actor: { actorGroupId: group.id } });

      // Action
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.IDENTITY, id: identityId },
        { scope: AccessScope.Project, orgId, projectId }
      );

      // Assert
      expect(grants.memberships).toHaveLength(1);
    });

    test("should return a custom role's slug and packed rules with the assignment", async () => {
      // Setup
      const { deps, orgId, projectId, userId } = await setup();
      const role = await write(deps, (dataAccess) =>
        dataAccess.roles.create({ projectId, name: "Reader", slug: "reader", permissions: [["read", "secrets"]] })
      );
      await projectMembership(deps, {
        orgId,
        projectId,
        actor: { actorUserId: userId },
        role: "custom",
        customRoleId: role.id
      });

      // Action
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.USER, id: userId },
        { scope: AccessScope.Project, orgId, projectId }
      );

      // Assert
      const [assignment] = grants.memberships[0].roles;
      expect(assignment.effectiveSlug).toBe("reader");
      expect(assignment.customRolePermissions).toEqual([["read", "secrets"]]);
    });

    test("should return the actor's project privileges but not its folder grants or another project's", async () => {
      // Setup
      const { h, deps, orgId, projectId, userId } = await setup();
      const otherProjectId = await h.newProject(orgId);
      await projectMembership(deps, { orgId, projectId, actor: { actorUserId: userId } });
      const kept = await write(deps, (dataAccess) =>
        dataAccess.privileges.create({ name: "p1", actorUserId: userId, projectId, permissions: [] })
      );
      await write(deps, (dataAccess) =>
        dataAccess.privileges.create({ name: "p2", actorUserId: userId, projectId: otherProjectId, permissions: [] })
      );

      // Action
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.USER, id: userId },
        { scope: AccessScope.Project, orgId, projectId }
      );

      // Assert
      expect(grants.privileges.map((privilege) => privilege.id)).toEqual([kept.id]);
    });

    test("should return org memberships only at the org scope", async () => {
      // Setup
      const { deps, orgId, projectId, userId } = await setup();
      await projectMembership(deps, { orgId, projectId, actor: { actorUserId: userId } });
      await write(deps, (dataAccess) =>
        dataAccess.memberships.create({
          scope: AccessScope.Organization,
          scopeOrgId: orgId,
          actorUserId: userId,
          roles: [{ role: OrgMembershipRole.Admin }]
        })
      );

      // Action
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.USER, id: userId },
        { scope: AccessScope.Organization, orgId }
      );

      // Assert
      expect(grants.memberships.map((membership) => membership.scope)).toEqual([AccessScope.Organization]);
    });

    test("should return a user's attributes in this org only", async () => {
      // Setup
      const { h, deps, orgId, projectId, userId } = await setup();
      const otherOrgId = await h.newOrg();
      await projectMembership(deps, { orgId, projectId, actor: { actorUserId: userId } });
      await write(deps, (dataAccess) =>
        dataAccess.attributes.replace({ userId, orgId }, [{ key: "team", value: "a" }])
      );
      await write(deps, (dataAccess) =>
        dataAccess.attributes.replace({ userId, orgId: otherOrgId }, [{ key: "team", value: "b" }])
      );

      // Action
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.USER, id: userId },
        { scope: AccessScope.Project, orgId, projectId }
      );

      // Assert
      expect(grants.attributeMap()).toEqual({ team: "a" });
    });

    test("should return only the active memberships of the requested resource", async () => {
      // Setup
      const { deps, orgId, projectId, userId } = await setup();
      const group = await write(deps, (dataAccess) =>
        dataAccess.groups.create({ orgId, name: "g", slug: `g-${projectId}` })
      );
      await write(deps, (dataAccess) => dataAccess.groups.addMembers(group.id, [{ userId }]));
      const resource = {
        scope: RESOURCE_SCOPE,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        scopeResourceType: "pam-folder"
      };
      await write(deps, (dataAccess) =>
        dataAccess.memberships.create({
          ...resource,
          scopeResourceId: "f1",
          actorUserId: userId,
          roles: [{ role: "admin" }]
        })
      );
      await write(deps, (dataAccess) =>
        dataAccess.memberships.create({
          ...resource,
          scopeResourceId: "f2",
          actorUserId: userId,
          roles: [{ role: "operator" }]
        })
      );
      await write(deps, (dataAccess) =>
        dataAccess.memberships.create({
          ...resource,
          scopeResourceId: "f1",
          actorGroupId: group.id,
          isActive: false,
          roles: [{ role: "auditor" }]
        })
      );

      // Action
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.USER, id: userId },
        { scope: RESOURCE_SCOPE, orgId, projectId, resourceType: "pam-folder", resourceId: "f1" }
      );

      // Assert
      expect(grants.memberships.flatMap((membership) => membership.roles.map((role) => role.role))).toEqual(["admin"]);
    });

    test("should refuse a second membership for the same actor at the same scope", async () => {
      // Setup
      const { deps, orgId, projectId, userId } = await setup();
      await projectMembership(deps, { orgId, projectId, actor: { actorUserId: userId } });

      // Action
      const second = projectMembership(deps, {
        orgId,
        projectId,
        actor: { actorUserId: userId },
        role: ProjectMembershipRole.Admin
      });

      // Assert
      await expect(second).rejects.toThrow();
      const grants = await deps.dataAccess.grants.findActorGrants(
        { type: ActorType.USER, id: userId },
        { scope: AccessScope.Project, orgId, projectId }
      );
      expect(grants.hasActiveRole(ProjectMembershipRole.Admin)).toBe(false);
    });

    test("should find an actor's memberships on one resource type, direct and through groups, active or not", async () => {
      // Setup
      const { h, deps, orgId, projectId, userId } = await setup();
      const otherProjectId = await h.newProject(orgId);
      const group = await write(deps, (dataAccess) =>
        dataAccess.groups.create({ orgId, name: "g", slug: `g-${projectId}` })
      );
      await write(deps, (dataAccess) => dataAccess.groups.addMembers(group.id, [{ userId }]));
      const bundle = { scope: RESOURCE_SCOPE, scopeOrgId: orgId, scopeResourceType: "agent-vault-access-bundle" };
      await write(deps, (dataAccess) =>
        dataAccess.memberships.create({
          ...bundle,
          scopeProjectId: projectId,
          scopeResourceId: "b1",
          actorUserId: userId,
          roles: [{ role: "consumer" }]
        })
      );
      await write(deps, (dataAccess) =>
        dataAccess.memberships.create({
          ...bundle,
          scopeProjectId: projectId,
          scopeResourceId: "b2",
          actorGroupId: group.id,
          isActive: false,
          roles: [{ role: "consumer" }]
        })
      );
      await write(deps, (dataAccess) =>
        dataAccess.memberships.create({
          ...bundle,
          scopeProjectId: otherProjectId,
          scopeResourceId: "b3",
          actorUserId: userId,
          roles: [{ role: "consumer" }]
        })
      );
      await write(deps, (dataAccess) =>
        dataAccess.memberships.create({
          ...bundle,
          scopeProjectId: projectId,
          scopeResourceType: "pam-folder",
          scopeResourceId: "f1",
          actorUserId: userId,
          roles: [{ role: "admin" }]
        })
      );

      // Action
      const memberships = await deps.dataAccess.memberships.findResourceMembershipsForActor({
        actor: { type: ActorType.USER, id: userId },
        projectId,
        resourceType: "agent-vault-access-bundle"
      });

      // Assert
      expect(memberships.map((membership) => membership.resourceId).sort()).toEqual(["b1", "b2"]);
    });

    test("should keep the same fingerprint when nothing changed", async () => {
      // Setup
      const { deps, orgId, projectId, userId } = await setup();
      await projectMembership(deps, { orgId, projectId, actor: { actorUserId: userId } });
      const actor = { type: ActorType.USER as const, id: userId };
      const first = await deps.dataAccess.grants.fingerprint(actor, { orgId, projectId });

      // Action
      const second = await deps.dataAccess.grants.fingerprint(actor, { orgId, projectId });

      // Assert
      expect(second).toBe(first);
    });

    test("should change the fingerprint when a privilege is added or a membership removed", async () => {
      // Setup
      const { deps, orgId, projectId, userId } = await setup();
      const membership = await projectMembership(deps, { orgId, projectId, actor: { actorUserId: userId } });
      const actor = { type: ActorType.USER as const, id: userId };
      const before = await deps.dataAccess.grants.fingerprint(actor, { orgId, projectId });

      // Action
      await write(deps, (dataAccess) =>
        dataAccess.privileges.create({ name: "p", actorUserId: userId, projectId, permissions: [] })
      );
      const afterPrivilege = await deps.dataAccess.grants.fingerprint(actor, { orgId, projectId });
      await write(deps, (dataAccess) => dataAccess.memberships.deleteByIds([membership.id]));
      const afterRemoval = await deps.dataAccess.grants.fingerprint(actor, { orgId, projectId });

      // Assert
      expect(new Set([before, afterPrivilege, afterRemoval]).size).toBe(3);
    });

    test("should change the fingerprint when a temporary role ends", async () => {
      // Setup
      const { deps, orgId, projectId, userId } = await setup();
      const actor = { type: ActorType.USER as const, id: userId };
      const endsSoon = new Date(Date.now() + 1500);
      await projectMembership(deps, {
        orgId,
        projectId,
        actor: { actorUserId: userId },
        temporaryAccessEndTime: endsSoon
      });
      const before = await deps.dataAccess.grants.fingerprint(actor, { orgId, projectId });

      // Action
      const after = () => deps.dataAccess.grants.fingerprint(actor, { orgId, projectId });

      // Assert
      await vi.waitFor(async () => expect(await after()).not.toBe(before), { timeout: 5000, interval: 200 });
    });
  });
};
