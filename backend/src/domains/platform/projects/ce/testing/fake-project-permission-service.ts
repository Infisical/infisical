/* eslint-disable class-methods-use-this */
import { ProjectType } from "@app/db/schemas";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { RuleIdentity, TActorGrantsService } from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { effectiveActorForProject } from "@app/lib/auth/principal";

import { ProjectAccess } from "../models/project-access";
import { ProjectPermission } from "../models/project-permission";
import { StandardProjectRoles, TProjectRoles } from "../models/standard-project-roles";
import { TGetProjectPermissionInput, TProjectPermissionService } from "../services/project-permission/service";
import { FakeProjectsService } from "./fake-projects-service";

// For tests of code that checks project permissions: the real rules over FakeProjectsService and Access Control's
// services, with no cache.
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
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      throw new RuleViolationError({ message: "Invalid actor provided", name: "Get org permission" });
    }
    const project = await this.projectStore.findProject(projectId);
    if (!project) throw new EntityNotFoundError({ message: `Project with ${projectId} not found` });
    project.assertUsableBy({ orgId: actor.org.id, type });
    const { actorType, actorId } = effectiveActorForProject(principal, projectId);
    const grants = await this.actorGrantsService.getCachedProjectGrants({
      actor: { type: actorType, id: actorId },
      orgId: project.orgId,
      projectId
    });
    if (!grants.hasMembership) return null;
    const username = principal.type === ActorType.USER ? principal.username : principal.name;
    return ProjectAccess.create({
      project,
      grants,
      roles: this.getProjectRoles({ projectType: project.type }),
      principal,
      identity: RuleIdentity.create({
        id: actorId,
        username: actorId === principal.id ? username : (principal.assumed?.actorName ?? ""),
        metadata: grants.attributeMap()
      })
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
