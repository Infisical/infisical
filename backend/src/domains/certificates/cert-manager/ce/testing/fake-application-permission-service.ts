import { randomUUID } from "node:crypto";

import { RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { ActorGrants } from "@app/domains/platform/access-control/ce/module";
import { ProjectResourcePermission } from "@app/domains/platform/projects/ce/module";

import { ApplicationRoles } from "../models/application-resource-roles";
import { ApplicationPermissionSet } from "../models/application-roles";
import {
  TApplicationPermissionService,
  TGetApplicationPermissionInput
} from "../services/application-permission/service";

// For tests of code that checks certificate application permissions: give the actor application roles, or make it
// a project admin, and get what ApplicationRoles says they grant. Anyone else is refused as a non-member.
export class FakeApplicationPermissionService implements TApplicationPermissionService {
  private readonly roles = new Map<string, string[]>();

  private readonly projectAdmins = new Set<string>();

  private readonly applicationRoles = new ApplicationRoles();

  assignRole({ actorId, applicationId, role }: { actorId: string; applicationId: string; role: string }): this {
    const key = `${actorId}:${applicationId}`;
    this.roles.set(key, [...(this.roles.get(key) ?? []), role]);
    return this;
  }

  makeProjectAdmin({ actorId, projectId }: { actorId: string; projectId: string }): this {
    this.projectAdmins.add(`${actorId}:${projectId}`);
    return this;
  }

  async getApplicationPermission({
    actor,
    projectId,
    applicationId
  }: TGetApplicationPermissionInput): Promise<ProjectResourcePermission<ApplicationPermissionSet>> {
    const isProjectAdmin = this.projectAdmins.has(`${actor.principal.id}:${projectId}`);
    const roles = this.roles.get(`${actor.principal.id}:${applicationId}`);
    if (roles) {
      const now = new Date();
      const grants = ActorGrants.restore({
        memberships: [
          {
            id: randomUUID(),
            scope: RESOURCE_SCOPE,
            scopeOrgId: actor.org.id,
            scopeProjectId: projectId,
            scopeResourceType: ResourceType.CertificateApplication,
            scopeResourceId: applicationId,
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
      return ProjectResourcePermission.fromGrants({ grants, roles: this.applicationRoles, isProjectAdmin });
    }
    if (isProjectAdmin) return ProjectResourcePermission.implicitAdmin({ roles: this.applicationRoles });
    throw new PermissionDeniedError({
      message: `You are not a member of this ${ResourceType.CertificateApplication}.`
    });
  }
}
