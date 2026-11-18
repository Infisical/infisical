import {
  AccessScope,
  RESOURCE_SCOPE,
  TAdditionalPrivileges,
  TGroups,
  TIdentityGroupMembership,
  TIdentityMetadata,
  TMembershipRoles,
  TMemberships,
  TRoles,
  TUserGroupMembership
} from "@app/db/schemas";
import { ActorType } from "@app/lib/auth/actor-types";
import { generateCacheKeyFromData } from "@app/lib/crypto/cache";

import { ActorGrants } from "../models/actor-grants";
import { Membership, TMembershipRecord } from "../models/membership";
import { Privilege } from "../models/privilege";
import { ProjectMemberGrants } from "../models/project-member-grants";
import { Role } from "../models/role";
import { TRoleAssignmentRecord } from "../models/role-assignment";
import { TGrantActor, TGrantScope, TGrantStore, TGroup, TRoleOwner } from "../services/dependencies";

export type TInMemoryGrantRows = {
  memberships: Map<string, TMemberships>;
  membershipRoles: Map<string, TMembershipRoles>;
  roles: Map<string, TRoles>;
  privileges: Map<string, TAdditionalPrivileges>;
  groups: Map<string, TGroups>;
  userGroupMembers: Map<string, TUserGroupMembership>;
  identityGroupMembers: Map<string, TIdentityGroupMembership>;
  attributes: Map<string, TIdentityMetadata>;
};

const byId = <T extends { id: string }>(a: T, b: T) => {
  if (a.id < b.id) return -1;
  return a.id > b.id ? 1 : 0;
};

const hasEnded = (row: { isTemporary?: boolean | null; temporaryAccessEndTime?: Date | null }, now: Date) =>
  Boolean(row.isTemporary && row.temporaryAccessEndTime && now >= row.temporaryAccessEndTime);

const ownsPrivilege = (actor: TGrantActor, privilege: TAdditionalPrivileges) =>
  actor.type === ActorType.USER ? privilege.actorUserId === actor.id : privilege.actorIdentityId === actor.id;

// Behaves like GrantStore over plain maps. Tests write through `rows` (see grant-fixture.ts); the store has no writes.
export class InMemoryGrantStore implements TGrantStore {
  readonly rows: TInMemoryGrantRows = {
    memberships: new Map(),
    membershipRoles: new Map(),
    roles: new Map(),
    privileges: new Map(),
    groups: new Map(),
    userGroupMembers: new Map(),
    identityGroupMembers: new Map(),
    attributes: new Map()
  };

  async findActorGrants(actor: TGrantActor, scope: TGrantScope): Promise<ActorGrants> {
    const memberships = this.joinedMemberships(
      this.actorMemberships(actor).filter((membership) => {
        if (membership.scopeOrgId !== scope.orgId || membership.scope !== scope.scope) return false;
        if (scope.scope === AccessScope.Project) return membership.scopeProjectId === scope.projectId;
        if (scope.scope === RESOURCE_SCOPE) {
          return (
            membership.scopeProjectId === scope.projectId &&
            membership.scopeResourceType === scope.resourceType &&
            membership.scopeResourceId === scope.resourceId &&
            membership.isActive
          );
        }
        return true;
      })
    );
    if (!memberships.length) return ActorGrants.empty();
    if (scope.scope === RESOURCE_SCOPE) return ActorGrants.restore({ memberships, privileges: [], attributes: [] });

    return ActorGrants.restore({
      memberships,
      privileges: this.actorPrivileges(actor).filter((privilege) =>
        scope.scope === AccessScope.Project ? privilege.projectId === scope.projectId : privilege.orgId === scope.orgId
      ),
      attributes: this.actorAttributes(actor, scope.orgId).map(({ id, key, value }) => ({ id, key, value }))
    });
  }

  async findGrantsFingerprint(actor: TGrantActor, scope: { orgId: string; projectId: string }): Promise<string> {
    const now = new Date();
    const memberships = this.joinedMemberships(
      this.actorMemberships(actor).filter(
        (membership) =>
          membership.scopeOrgId === scope.orgId &&
          (membership.scope === AccessScope.Organization ||
            ([AccessScope.Project, RESOURCE_SCOPE].includes(membership.scope as AccessScope) &&
              membership.scopeProjectId === scope.projectId))
      )
    ).flatMap((membership) =>
      membership.roles.map((role) => ({
        mId: membership.id,
        mActive: membership.isActive,
        mStatus: membership.status ?? null,
        rId: role.id,
        rUp: role.updatedAt,
        crUp: role.customRoleId ? (this.rows.roles.get(role.customRoleId)?.updatedAt ?? null) : null,
        rExp: hasEnded(role, now)
      }))
    );
    const privileges = this.actorPrivileges(actor)
      .filter((privilege) => privilege.projectId === scope.projectId && !privilege.folderId)
      .map((privilege) => ({ id: privilege.id, updatedAt: privilege.updatedAt, pExp: hasEnded(privilege, now) }));
    const attributes = this.actorAttributes(actor, scope.orgId).map(({ id, updatedAt }) => ({ id, updatedAt }));
    return generateCacheKeyFromData({ memberships, privileges, attributes });
  }

  async findProjectMemberGrants(scope: { orgId: string; projectId: string }): Promise<ProjectMemberGrants> {
    const memberships = this.joinedMemberships(
      [...this.rows.memberships.values()].filter(
        (membership) =>
          membership.scopeOrgId === scope.orgId &&
          membership.scope === AccessScope.Project &&
          membership.scopeProjectId === scope.projectId
      )
    );
    const userIds = new Set(memberships.flatMap((membership) => membership.actorUserId ?? []));
    const identityIds = new Set(memberships.flatMap((membership) => membership.actorIdentityId ?? []));
    const privileges = [...this.rows.privileges.values()]
      .filter((privilege) => privilege.projectId === scope.projectId && !privilege.folderId)
      .sort(byId);
    const attributes = [...this.rows.attributes.values()]
      .filter(
        (attribute) =>
          (attribute.userId && userIds.has(attribute.userId) && attribute.orgId === scope.orgId) ||
          (attribute.identityId && identityIds.has(attribute.identityId))
      )
      .sort(byId)
      .map(({ id, key, value, userId, identityId }) => ({ id, key, value, userId, identityId }));
    return ProjectMemberGrants.restore({ memberships, privileges, attributes });
  }

  async findFolderGrants({ actor, projectId }: { actor: TGrantActor; projectId: string }): Promise<Privilege[]> {
    return [...this.rows.privileges.values()]
      .filter((privilege) => privilege.projectId === projectId && privilege.folderId && ownsPrivilege(actor, privilege))
      .sort(byId)
      .map((privilege) => Privilege.restore(privilege));
  }

  async findProjectFolderGrants({ projectId }: { projectId: string }): Promise<Privilege[]> {
    return [...this.rows.privileges.values()]
      .filter((privilege) => privilege.projectId === projectId && privilege.folderId)
      .sort(byId)
      .map((privilege) => Privilege.restore(privilege));
  }

  async findResourceMembershipsForActor({
    actor,
    projectId,
    resourceType
  }: {
    actor: TGrantActor;
    projectId: string;
    resourceType: string;
  }): Promise<Membership[]> {
    return this.actorMemberships(actor)
      .filter(
        (membership) =>
          membership.scope === RESOURCE_SCOPE &&
          membership.scopeProjectId === projectId &&
          membership.scopeResourceType === resourceType
      )
      .map((membership) => Membership.restore({ ...membership, roles: this.assignmentsOf(membership.id) }));
  }

  async findRolesBySlugs({ owner, slugs }: { owner: TRoleOwner; slugs: string[] }): Promise<Role[]> {
    return [...this.rows.roles.values()]
      .filter(
        (role) =>
          slugs.includes(role.slug) &&
          Object.entries(owner).every(([column, value]) => role[column as keyof TRoles] === value)
      )
      .sort((a, b) => {
        if (a.slug < b.slug) return -1;
        return a.slug > b.slug ? 1 : 0;
      })
      .map((role) => Role.restore(role));
  }

  async findGroupsByIds(ids: string[]): Promise<TGroup[]> {
    return [...this.rows.groups.values()]
      .filter((group) => ids.includes(group.id))
      .sort(byId)
      .map(({ id, orgId, name, slug }) => ({ id, orgId, name, slug }));
  }

  private actorMemberships(actor: TGrantActor): TMemberships[] {
    const groupIds = new Set(
      actor.type === ActorType.USER
        ? [...this.rows.userGroupMembers.values()].filter((row) => row.userId === actor.id).map((row) => row.groupId)
        : [...this.rows.identityGroupMembers.values()]
            .filter((row) => row.identityId === actor.id)
            .map((row) => row.groupId)
    );
    return [...this.rows.memberships.values()]
      .filter((membership) => {
        if (membership.actorGroupId && groupIds.has(membership.actorGroupId)) return true;
        return actor.type === ActorType.USER
          ? membership.actorUserId === actor.id
          : membership.actorIdentityId === actor.id;
      })
      .sort(byId);
  }

  private assignmentsOf(membershipId: string): TRoleAssignmentRecord[] {
    return [...this.rows.membershipRoles.values()]
      .filter((role) => role.membershipId === membershipId)
      .sort(byId)
      .map(({ membershipId: _membershipId, ...role }) => {
        const customRole = role.customRoleId ? this.rows.roles.get(role.customRoleId) : undefined;
        return {
          ...role,
          customRoleSlug: customRole?.slug ?? null,
          customRoleName: customRole?.name ?? null,
          customRolePermissions: customRole?.permissions ?? null
        };
      });
  }

  // The inner join on membership_roles: a membership with no role assignment is not returned.
  private joinedMemberships(memberships: TMemberships[]): TMembershipRecord[] {
    return memberships
      .map((membership) => ({ ...membership, roles: this.assignmentsOf(membership.id) }))
      .filter((membership) => membership.roles.length > 0);
  }

  private actorPrivileges(actor: TGrantActor): TAdditionalPrivileges[] {
    return [...this.rows.privileges.values()]
      .filter((privilege) => !privilege.folderId && ownsPrivilege(actor, privilege))
      .sort(byId);
  }

  // A user's attributes are per org; an identity belongs to one org, so its attributes are its own.
  private actorAttributes(actor: TGrantActor, orgId: string): TIdentityMetadata[] {
    return [...this.rows.attributes.values()]
      .filter((attribute) =>
        actor.type === ActorType.USER
          ? attribute.userId === actor.id && attribute.orgId === orgId
          : attribute.identityId === actor.id
      )
      .sort(byId);
  }
}
