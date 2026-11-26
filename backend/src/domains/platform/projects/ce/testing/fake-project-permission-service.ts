/* eslint-disable class-methods-use-this */
import { ProjectType } from "@app/db/schemas";
import { roleHolderOf } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, PermissionDeniedError } from "@app/domains/lib/errors";
import { RuleIdentity, TActorGrantsService } from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { ProjectAccess } from "../models/project-access";
import { ProjectPermission } from "../models/project-permission";
import { StandardProjectRoles, TProjectRoles } from "../models/standard-project-roles";
import { TGetProjectPermissionInput, TProjectPermissionService } from "../services/project-permission/service";
import { FakeProjectsService } from "./fake-projects-service";

// Real rules over FakeProjectsService and Access Control's services, no cache.
export class FakeProjectPermissionService implements TProjectPermissionService {
  constructor(
    private readonly projectStore: FakeProjectsService,
    private readonly actorGrantsService: TActorGrantsService
  ) {}

  async getProjectPermission(input: TGetProjectPermissionInput): Promise<ProjectPermission> {
    return (await this.getProjectAccess(input)).toPermission();
  }

  async getProjectAccess(input: TGetProjectPermissionInput): Promise<ProjectAccess> {
    const access = await this.findProjectAccess(input);
    if (access) return access;
    const type = input.actor.principal.type === ActorType.IDENTITY ? ActorType.IDENTITY : ActorType.USER;
    throw new PermissionDeniedError({
      name: "ProjectMembershipNotFound",
      message: `You are not a member of this project with ID ${input.projectId}. Please assign this ${type} to the project with the appropriate permissions, then try again.`
    });
  }

  async findProjectAccess({ actor, projectId, type }: TGetProjectPermissionInput): Promise<ProjectAccess | null> {
    const { principal } = actor;
    const holder = roleHolderOf(principal, { projectId });
    const project = await this.projectStore.findProject(projectId);
    if (!project) throw new EntityNotFoundError({ message: `Project with ${projectId} not found` });
    project.assertUsableBy({ orgId: actor.org.id, type });
    const grants = await this.actorGrantsService.getCachedProjectGrants({
      actor: holder,
      orgId: project.orgId,
      projectId
    });
    if (!grants.hasMembership) return null;
    let username = "";
    if (principal.type === ActorType.USER) username = principal.username;
    if (principal.type === ActorType.IDENTITY) username = grants.actorName ?? principal.name;
    const assumedName = "assumed" in principal ? principal.assumed?.actorName : undefined;
    return ProjectAccess.create({
      project,
      grants,
      roles: this.getProjectRoles({ projectType: project.type }),
      principal,
      identity: RuleIdentity.create({
        id: holder.id,
        username: holder.id === principal.id ? username : (assumedName ?? ""),
        metadata: grants.attributeMap()
      }),
      usesNewPrivilegeSystem: actor.org.shouldUseNewPrivilegeSystem
    });
  }

  getProjectRoles({ projectType }: { projectType: ProjectType }): TProjectRoles {
    return StandardProjectRoles.generic(projectType);
  }

  async getProjectPermissionByRoles(): Promise<never> {
    throw new Error("FakeProjectPermissionService.getProjectPermissionByRoles is not implemented");
  }

  async getGrantPermissions(): Promise<never> {
    throw new Error("FakeProjectPermissionService.getGrantPermissions is not implemented");
  }

  async getPermissionAuditSources(): Promise<never> {
    throw new Error("FakeProjectPermissionService.getPermissionAuditSources is not implemented");
  }
}
