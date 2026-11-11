import { AccessScope, RESOURCE_SCOPE, TMemberships } from "@app/db/schemas";
import { ActorType } from "@app/lib/auth/actor-types";
import { generateCacheKeyFromData } from "@app/lib/crypto/cache";

import { TGrantActor, TGrantDataAccess, TGrantScope } from "../data-access/grant-data-access";
import { ActorGrants } from "../model/actor-grants";
import { TMembershipProps } from "../model/membership";
import { ProjectMemberGrants } from "../model/project-member-grants";
import { InMemoryAccessControlState } from "./in-memory-access-control-state";

const isExpired = (row: { isTemporary?: boolean | null; temporaryAccessEndTime?: Date | null }, now: Date) =>
  Boolean(row.isTemporary && row.temporaryAccessEndTime && now >= row.temporaryAccessEndTime);

export class InMemoryGrantDataAccess implements TGrantDataAccess {
  constructor(private readonly state: InMemoryAccessControlState) {}

  private actorMemberships(actor: TGrantActor): TMemberships[] {
    const groupIds = new Set(
      this.state.groupIdsOf(actor.type === ActorType.USER ? { userId: actor.id } : { identityId: actor.id })
    );
    return [...this.state.tables.memberships.values()].filter((membership) =>
      actor.type === ActorType.USER
        ? membership.actorUserId === actor.id || (membership.actorGroupId && groupIds.has(membership.actorGroupId))
        : membership.actorIdentityId === actor.id || (membership.actorGroupId && groupIds.has(membership.actorGroupId))
    );
  }

  private withRoles(membership: TMemberships): TMembershipProps {
    const roles = [...this.state.tables.membershipRoles.values()]
      .filter((role) => role.membershipId === membership.id)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((role) => {
        const customRole = role.customRoleId ? this.state.tables.roles.get(role.customRoleId) : undefined;
        return {
          ...role,
          customRoleSlug: customRole?.slug ?? null,
          customRoleName: customRole?.name ?? null,
          customRolePermissions: customRole?.permissions ?? null
        };
      });
    return { ...membership, roles };
  }

  private attributesOf(actor: TGrantActor, orgId: string) {
    return [...this.state.tables.attributes.values()]
      .filter((attribute) =>
        actor.type === ActorType.USER
          ? attribute.userId === actor.id && attribute.orgId === orgId
          : attribute.identityId === actor.id
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private privilegesOf(actor: TGrantActor, scope: { orgId?: string; projectId?: string }) {
    return [...this.state.tables.privileges.values()]
      .filter((privilege) => {
        const ownsIt =
          actor.type === ActorType.USER ? privilege.actorUserId === actor.id : privilege.actorIdentityId === actor.id;
        if (!ownsIt || privilege.folderId) return false;
        return scope.projectId ? privilege.projectId === scope.projectId : privilege.orgId === scope.orgId;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async findActorGrants(actor: TGrantActor, scope: TGrantScope): Promise<ActorGrants> {
    const memberships = this.actorMemberships(actor)
      .filter((membership) => {
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
      .map((membership) => this.withRoles(membership))
      // A membership without a role assignment is not returned, as the SQL inner join on membership_roles does.
      .filter((membership) => membership.roles.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    if (!memberships.length) return ActorGrants.empty();
    if (scope.scope === RESOURCE_SCOPE) return ActorGrants.restore({ memberships, privileges: [], attributes: [] });

    return ActorGrants.restore({
      memberships,
      privileges: this.privilegesOf(
        actor,
        scope.scope === AccessScope.Project ? { projectId: scope.projectId } : { orgId: scope.orgId }
      ),
      attributes: this.attributesOf(actor, scope.orgId).map(({ id, key, value }) => ({ id, key, value }))
    });
  }

  async fingerprint(actor: TGrantActor, scope: { orgId: string; projectId: string }): Promise<string> {
    const now = new Date();
    const memberships = this.actorMemberships(actor)
      .filter(
        (membership) =>
          membership.scopeOrgId === scope.orgId &&
          (membership.scope === AccessScope.Organization || membership.scopeProjectId === scope.projectId)
      )
      .map((membership) => this.withRoles(membership))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((membership) => ({
        id: membership.id,
        isActive: membership.isActive,
        status: membership.status,
        roles: membership.roles.map((role) => ({
          id: role.id,
          updatedAt: role.updatedAt,
          customRolePermissions: role.customRolePermissions,
          expired: isExpired(role, now)
        }))
      }));
    const privileges = this.privilegesOf(actor, { projectId: scope.projectId }).map((privilege) => ({
      id: privilege.id,
      updatedAt: privilege.updatedAt,
      expired: isExpired(privilege, now)
    }));
    const attributes = this.attributesOf(actor, scope.orgId).map(({ id, updatedAt, value }) => ({
      id,
      updatedAt,
      value
    }));
    return generateCacheKeyFromData({ memberships, privileges, attributes });
  }

  async findProjectMemberGrants(scope: { orgId: string; projectId: string }): Promise<ProjectMemberGrants> {
    const memberships = [...this.state.tables.memberships.values()]
      .filter(
        (membership) =>
          membership.scopeOrgId === scope.orgId &&
          membership.scope === AccessScope.Project &&
          membership.scopeProjectId === scope.projectId
      )
      .map((membership) => this.withRoles(membership))
      .filter((membership) => membership.roles.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
    const userIds = new Set(memberships.flatMap((membership) => membership.actorUserId ?? []));
    const identityIds = new Set(memberships.flatMap((membership) => membership.actorIdentityId ?? []));
    const privileges = [...this.state.tables.privileges.values()]
      .filter((privilege) => privilege.projectId === scope.projectId && !privilege.folderId)
      .sort((a, b) => a.id.localeCompare(b.id));
    const attributes = [...this.state.tables.attributes.values()]
      .filter(
        (attribute) =>
          (attribute.userId && userIds.has(attribute.userId) && attribute.orgId === scope.orgId) ||
          (attribute.identityId && identityIds.has(attribute.identityId))
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, key, value, userId, identityId }) => ({ id, key, value, userId, identityId }));
    return ProjectMemberGrants.restore({ memberships, privileges, attributes });
  }
}
