import { randomUUID } from "node:crypto";

import { RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import {
  ActorGrants,
  Membership,
  TActorGrantsService,
  TActorMembership,
  TGrantActor,
  TMembershipRecord
} from "@app/domains/platform/access-control/ce/module";
import { ProjectResourcePermission, TProjectResourcePermissionService } from "@app/domains/platform/projects/ce/module";

import { PamAccountRoles, PamFolderRoles } from "../models/pam-resource-roles";
import { PamResourcePermissionSet } from "../models/permissions/pam-roles";
import {
  PamPermissionService,
  TAccountAccessInput,
  TGetPamPermissionInput,
  TPamAccountRef,
  TPamActionFilter,
  TPamPermissionService,
  TPamPermissionTransaction
} from "../services/pam-permission/service";

type TPamResource = { resourceType: ResourceType.PamFolder | ResourceType.PamAccount; resourceId: string };

// Assign folder/account roles or product admin; permissions come from the real PAM resource roles. Anyone else is
// refused as a non-member.
export class FakePamPermissionService implements TPamPermissionService {
  private readonly roles = new Map<string, string[]>();

  private readonly projectAdmins = new Set<string>();

  assignFolderRole({ actorId, folderId, role }: { actorId: string; folderId: string; role: string }): this {
    return this.assign(actorId, { resourceType: ResourceType.PamFolder, resourceId: folderId }, role);
  }

  assignAccountRole({ actorId, accountId, role }: { actorId: string; accountId: string; role: string }): this {
    return this.assign(actorId, { resourceType: ResourceType.PamAccount, resourceId: accountId }, role);
  }

  makeProjectAdmin({ actorId, projectId }: { actorId: string; projectId: string }): this {
    this.projectAdmins.add(`${actorId}:${projectId}`);
    return this;
  }

  async getPamPermission({
    actor,
    projectId,
    folderId,
    accountId
  }: TGetPamPermissionInput): Promise<ProjectResourcePermission<PamResourcePermissionSet>> {
    const resources: TPamResource[] = [];
    if (folderId) resources.push({ resourceType: ResourceType.PamFolder, resourceId: folderId });
    if (accountId) resources.push({ resourceType: ResourceType.PamAccount, resourceId: accountId });
    const roles = accountId ? new PamAccountRoles() : new PamFolderRoles();
    const isProjectAdmin = this.projectAdmins.has(`${actor.principal.id}:${projectId}`);
    const now = new Date();
    const memberships: TMembershipRecord[] = resources.flatMap(({ resourceType, resourceId }) => {
      const slugs = this.roles.get(`${actor.principal.id}:${resourceType}:${resourceId}`);
      if (!slugs) return [];
      return [
        {
          id: randomUUID(),
          scope: RESOURCE_SCOPE,
          scopeOrgId: actor.org.id,
          scopeProjectId: projectId,
          scopeResourceType: resourceType,
          scopeResourceId: resourceId,
          actorUserId: actor.principal.id,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          roles: slugs.map((role) => ({ id: randomUUID(), role, isTemporary: false, createdAt: now, updatedAt: now }))
        }
      ];
    });
    if (memberships.length) {
      const grants = ActorGrants.restore({ memberships, privileges: [], attributes: [] });
      return ProjectResourcePermission.fromGrants({ grants, roles, isProjectAdmin });
    }
    if (isProjectAdmin) return ProjectResourcePermission.implicitAdmin({ roles });
    const last = resources[resources.length - 1];
    throw new PermissionDeniedError({ message: `You are not a member of this ${last?.resourceType ?? "resource"}.` });
  }

  // Membership reads go through the real service, backed by the same assigned roles.
  private readonly memberships = new PamPermissionService(
    {} as TProjectResourcePermissionService,
    {
      listResourceMembershipsForActors: async ({ actors, projectId }: { actors: TGrantActor[]; projectId: string }) =>
        this.membershipsOf(actors, projectId),
      within: () => ({
        listResourceMembershipsForActors: async ({ actors, projectId }: { actors: TGrantActor[]; projectId: string }) =>
          this.membershipsOf(actors, projectId)
      })
    } as unknown as TActorGrantsService
  );

  async assertAccountAccess(input: TAccountAccessInput) {
    return PamPermissionService.prototype.assertAccountAccess.call(this, input);
  }

  async canAccessAccount(input: TAccountAccessInput) {
    return PamPermissionService.prototype.canAccessAccount.call(this, input);
  }

  getResourceIdsWithActions(input: { actor: TActorContext; projectId: string; actions: TPamActionFilter }) {
    return this.memberships.getResourceIdsWithActions(input);
  }

  getResourceIdsWithActionsForActors(input: { actors: TGrantActor[]; projectId: string; actions: TPamActionFilter }) {
    return this.memberships.getResourceIdsWithActionsForActors(input);
  }

  getLaunchAccessRemainingMs(input: { actor: TGrantActor; projectId: string; account: TPamAccountRef }) {
    return this.memberships.getLaunchAccessRemainingMs(input);
  }

  getAccountPermissionRules(input: { actor: TActorContext; projectId: string; accounts: TPamAccountRef[] }) {
    return this.memberships.getAccountPermissionRules(input);
  }

  within(): TPamPermissionTransaction {
    return this.memberships.within({} as never);
  }

  private membershipsOf(actors: TGrantActor[], projectId: string): TActorMembership[] {
    const now = new Date();
    return actors.flatMap((actor) =>
      [...this.roles.entries()].flatMap(([key, slugs]) => {
        const [actorId, resourceType, resourceId] = key.split(":");
        if (actorId !== actor.id) return [];
        const membership = Membership.restore({
          id: randomUUID(),
          scope: RESOURCE_SCOPE,
          scopeOrgId: "",
          scopeProjectId: projectId,
          scopeResourceType: resourceType,
          scopeResourceId: resourceId,
          actorUserId: actor.id,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          roles: slugs.map((role) => ({ id: randomUUID(), role, isTemporary: false, createdAt: now, updatedAt: now }))
        });
        return [{ actor, membership }];
      })
    );
  }

  private assign(actorId: string, { resourceType, resourceId }: TPamResource, role: string): this {
    const key = `${actorId}:${resourceType}:${resourceId}`;
    this.roles.set(key, [...(this.roles.get(key) ?? []), role]);
    return this;
  }
}
