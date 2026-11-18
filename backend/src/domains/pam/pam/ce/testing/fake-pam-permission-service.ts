import { randomUUID } from "node:crypto";

import { RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { ActorGrants, TMembershipRecord } from "@app/domains/platform/access-control/ce/module";
import { ProjectResourcePermission } from "@app/domains/platform/projects/ce/module";

import { PamAccountRoles, PamFolderRoles } from "../models/pam-resource-roles";
import { PamResourcePermissionSet } from "../models/pam-roles";
import { TGetPamPermissionInput, TPamPermissionService } from "../services/pam-permission/service";

type TPamResource = { resourceType: ResourceType.PamFolder | ResourceType.PamAccount; resourceId: string };

// For tests of code that checks PAM permissions: give the actor folder or account roles, or make it the product
// admin, and get what the PAM resource roles say they grant, a folder's and an account's together. Anyone else is
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

  private assign(actorId: string, { resourceType, resourceId }: TPamResource, role: string): this {
    const key = `${actorId}:${resourceType}:${resourceId}`;
    this.roles.set(key, [...(this.roles.get(key) ?? []), role]);
    return this;
  }
}
