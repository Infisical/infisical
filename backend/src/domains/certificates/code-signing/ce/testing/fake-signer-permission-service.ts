import { randomUUID } from "node:crypto";

import { RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { ActorGrants } from "@app/domains/platform/access-control/ce/module";
import { ProjectResourcePermission } from "@app/domains/platform/projects/ce/module";

import { SignerPermissionSet } from "../models/permissions/signer-roles";
import { SignerRoles } from "../models/signer-resource-roles";
import { TGetSignerPermissionInput, TSignerPermissionService } from "../services/signer-permission/service";

// Grants are whatever SignerRoles says. Actors with no roles that aren't project admins are refused as non-members.
export class FakeSignerPermissionService implements TSignerPermissionService {
  private readonly roles = new Map<string, string[]>();

  private readonly projectAdmins = new Set<string>();

  private readonly signerRoles = new SignerRoles();

  assignRole({ actorId, signerId, role }: { actorId: string; signerId: string; role: string }): this {
    const key = `${actorId}:${signerId}`;
    this.roles.set(key, [...(this.roles.get(key) ?? []), role]);
    return this;
  }

  makeProjectAdmin({ actorId, projectId }: { actorId: string; projectId: string }): this {
    this.projectAdmins.add(`${actorId}:${projectId}`);
    return this;
  }

  async getSignerPermission({
    actor,
    projectId,
    signerId
  }: TGetSignerPermissionInput): Promise<ProjectResourcePermission<SignerPermissionSet>> {
    const isProjectAdmin = this.projectAdmins.has(`${actor.principal.id}:${projectId}`);
    const roles = this.roles.get(`${actor.principal.id}:${signerId}`);
    if (roles) {
      const now = new Date();
      const grants = ActorGrants.restore({
        memberships: [
          {
            id: randomUUID(),
            scope: RESOURCE_SCOPE,
            scopeOrgId: actor.org.id,
            scopeProjectId: projectId,
            scopeResourceType: ResourceType.Signer,
            scopeResourceId: signerId,
            actorUserId: actor.principal.id,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            roles: roles.map((role) => ({ id: randomUUID(), role, isTemporary: false, createdAt: now, updatedAt: now }))
          }
        ],
        privileges: [],
        attributes: []
      });
      return ProjectResourcePermission.fromGrants({ grants, roles: this.signerRoles, isProjectAdmin });
    }
    if (isProjectAdmin) return ProjectResourcePermission.implicitAdmin({ roles: this.signerRoles });
    throw new PermissionDeniedError({ message: `You are not a member of this ${ResourceType.Signer}.` });
  }
}
