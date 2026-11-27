import { randomUUID } from "node:crypto";

import { AccessScope, ProjectType } from "@app/db/schemas";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { ActorGrants, RuleIdentity } from "@app/domains/platform/access-control/ce/module";
import { Project, ProjectAccess, ProjectPermission } from "@app/domains/platform/projects/ce/module";

import { kmsProjectRoles } from "../models/permissions/kms-project-roles";
import { TGetKmsPermissionInput, TKmsPermissionService } from "../services/kms-permission/service";

// Roles mean what kmsProjectRoles says. An actor with none is refused as a non-member.
export class FakeKmsPermissionService implements TKmsPermissionService {
  private readonly roles = new Map<string, string[]>();

  assignRole({ actorId, projectId, role }: { actorId: string; projectId: string; role: string }): this {
    const key = `${actorId}:${projectId}`;
    this.roles.set(key, [...(this.roles.get(key) ?? []), role]);
    return this;
  }

  async getKmsPermission({ actor, projectId }: TGetKmsPermissionInput): Promise<ProjectPermission> {
    const roles = this.roles.get(`${actor.principal.id}:${projectId}`);
    if (!roles) {
      throw new PermissionDeniedError({
        name: "ProjectMembershipNotFound",
        message: `You are not a member of this project with ID ${projectId}.`
      });
    }
    const now = new Date();
    const grants = ActorGrants.restore({
      memberships: [
        {
          id: randomUUID(),
          scope: AccessScope.Project,
          scopeOrgId: actor.org.id,
          scopeProjectId: projectId,
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
    return ProjectAccess.create({
      project: Project.restore({
        id: projectId,
        name: projectId,
        slug: projectId,
        orgId: actor.org.id,
        type: ProjectType.KMS
      }),
      grants,
      roles: kmsProjectRoles,
      principal: actor.principal,
      identity: RuleIdentity.create({ id: actor.principal.id, username: "", metadata: {} }),
      usesNewPrivilegeSystem: actor.org.shouldUseNewPrivilegeSystem
    }).toPermission();
  }
}
