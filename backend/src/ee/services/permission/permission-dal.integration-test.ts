import {
  AccessScope,
  OrgMembershipStatus,
  ProjectMembershipRole,
  TableName,
  TMembershipsInsert
} from "@app/db/schemas";
import { randomId, setupIntegration } from "@app/domains/lib/testing/integration";
import { ActorType } from "@app/services/auth/auth-type";

import { permissionDALFactory } from "./permission-dal";

type TActorKind = ActorType.IDENTITY | ActorType.USER;

describe.each([ActorType.IDENTITY, ActorType.USER] as TActorKind[])(
  "permissionDAL for an actor of type %s",
  (actorType) => {
    const h = setupIntegration();

    // The actor holds direct org and project memberships, and gets the same two scopes again through a group.
    const actorWithDirectAndGroupMemberships = async () => {
      const tn = await h.newTenant();
      const orgId = tn.org.id;
      const projectId = tn.project.id;
      const actorCol = actorType === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId";

      let actorId: string;
      if (actorType === ActorType.IDENTITY) {
        [{ id: actorId }] = await h
          .db(TableName.Identity)
          .insert({ name: `identity-${randomId()}`, orgId })
          .returning("id");
      } else {
        ({ id: actorId } = await h.factories.user());
      }
      const [{ id: groupId }] = await h
        .db(TableName.Groups)
        .insert({ orgId, name: `group-${randomId()}`, slug: `group-${randomId()}` })
        .returning("id");
      if (actorType === ActorType.IDENTITY) {
        await h.db(TableName.IdentityGroupMembership).insert({ identityId: actorId, groupId });
      } else {
        await h.db(TableName.UserGroupMembership).insert({ userId: actorId, groupId, isPending: false });
      }

      const membership = async (row: Omit<TMembershipsInsert, "scopeOrgId">) => {
        const [created] = await h
          .db(TableName.Membership)
          .insert({ scopeOrgId: orgId, status: OrgMembershipStatus.Accepted, isActive: true, ...row })
          .returning("id");
        await h.db(TableName.MembershipRole).insert({ membershipId: created.id, role: ProjectMembershipRole.Admin });
        return created.id as string;
      };
      const directProject = await membership({
        scope: AccessScope.Project,
        scopeProjectId: projectId,
        [actorCol]: actorId
      });
      await membership({ scope: AccessScope.Organization, [actorCol]: actorId });
      const groupProject = await membership({
        scope: AccessScope.Project,
        scopeProjectId: projectId,
        actorGroupId: groupId
      });
      await membership({ scope: AccessScope.Organization, actorGroupId: groupId });

      const dal = permissionDALFactory(h.db);
      const fingerprint = () => dal.getPermissionFingerprint({ projectId, orgId, actorId, actorType });
      return {
        tn,
        orgId,
        projectId,
        actorId,
        actorCol,
        groupId,
        directProject,
        groupProject,
        dal,
        fingerprint,
        membership
      };
    };

    test("should return the same fingerprint on repeated calls", async () => {
      // Setup
      const { fingerprint } = await actorWithDirectAndGroupMemberships();

      // Action
      const [first, second] = [await fingerprint(), await fingerprint()];

      // Assert
      expect(second).toBe(first);
    });

    test("should load the actor's direct and group memberships for the project and nothing else", async () => {
      // Setup
      const { dal, orgId, projectId, actorId, actorCol, directProject, groupProject, membership, tn } =
        await actorWithDirectAndGroupMemberships();
      const other = await h.factories.project({ orgId });
      await membership({ scope: AccessScope.Project, scopeProjectId: other.project.id, [actorCol]: actorId });

      // Action
      const permission = await dal.getPermission({
        scopeData: { scope: AccessScope.Project, orgId, projectId },
        actorId,
        actorType
      });

      // Assert
      expect(permission.map((m) => m.id).sort()).toEqual([directProject, groupProject].sort());
      expect(permission.every((m) => m.scopeProjectId === tn.project.id)).toBe(true);
    });

    test("should change the fingerprint when a membership role changes", async () => {
      // Setup
      const { fingerprint, groupProject } = await actorWithDirectAndGroupMemberships();
      const before = await fingerprint();

      // Action
      await h
        .db(TableName.MembershipRole)
        .where({ membershipId: groupProject })
        .update({ role: ProjectMembershipRole.Viewer });

      // Assert
      expect(await fingerprint()).not.toBe(before);
    });

    test("should change the fingerprint when a membership's status changes", async () => {
      // Setup
      const { fingerprint, directProject } = await actorWithDirectAndGroupMemberships();
      const before = await fingerprint();

      // Action
      await h.db(TableName.Membership).where({ id: directProject }).update({ status: OrgMembershipStatus.Invited });

      // Assert
      expect(await fingerprint()).not.toBe(before);
    });

    test("should change the fingerprint when the project is soft-deleted", async () => {
      // Setup
      const { fingerprint, projectId } = await actorWithDirectAndGroupMemberships();
      const before = await fingerprint();

      // Action
      await h
        .db(TableName.Project)
        .where({ id: projectId })
        .update({ deleteAfter: new Date(Date.now() + 60_000) });

      // Assert
      expect(await fingerprint()).not.toBe(before);
    });

    test("should change the fingerprint when the actor's group gains an org-scope role", async () => {
      // Setup
      const { fingerprint, orgId, groupId } = await actorWithDirectAndGroupMemberships();
      const before = await fingerprint();
      const [groupOrgMembership] = await h
        .db(TableName.Membership)
        .where({ scope: AccessScope.Organization, scopeOrgId: orgId, actorGroupId: groupId })
        .select("id");

      // Action
      await h
        .db(TableName.MembershipRole)
        .insert({ membershipId: groupOrgMembership.id, role: ProjectMembershipRole.Viewer });

      // Assert
      expect(await fingerprint()).not.toBe(before);
    });

    test("should keep the fingerprint when the actor joins another project", async () => {
      // Setup
      const { fingerprint, orgId, actorId, actorCol, groupId, membership } = await actorWithDirectAndGroupMemberships();
      const before = await fingerprint();
      const other = await h.factories.project({ orgId });

      // Action
      await membership({ scope: AccessScope.Project, scopeProjectId: other.project.id, [actorCol]: actorId });
      await membership({ scope: AccessScope.Project, scopeProjectId: other.project.id, actorGroupId: groupId });

      // Assert
      expect(await fingerprint()).toBe(before);
    });
  }
);
