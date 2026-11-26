import { ProjectType } from "@app/db/schemas";
import { PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { Project, ProjectPermission } from "@app/domains/platform/projects/ce/module";

export type TServiceTokenRecord = {
  id: string;
  projectId: string;
  scopes: unknown;
  permissions: string[];
};

// Legacy service token, bound to one project.
export class ServiceToken {
  private constructor(
    private readonly id: string,
    readonly projectId: string,
    private readonly scopes: unknown,
    private readonly permissions: string[]
  ) {}

  static restore({ id, projectId, scopes, permissions }: TServiceTokenRecord): ServiceToken {
    return new ServiceToken(id, projectId, scopes, [...(permissions ?? [])]);
  }

  // `project` is the token's own project, null if it was deleted.
  assertUsableIn({
    project,
    projectId,
    orgId,
    anyProjectType = false
  }: {
    project: Project | null;
    projectId: string;
    orgId: string;
    // For checks every project type shares, so any project type is fine.
    anyProjectType?: boolean;
  }): Project {
    if (!project) throw new RuleViolationError({ message: "Service token not linked to a project" });
    if (this.projectId !== projectId) {
      throw new PermissionDeniedError({
        message: `Service token not a part of the specified project with ID ${projectId}`
      });
    }
    if (project.orgId !== orgId) {
      throw new PermissionDeniedError({
        message: `Service token not a part of the specified organization with ID ${orgId}`
      });
    }
    if (!anyProjectType && project.type !== ProjectType.SecretManager) {
      throw new RuleViolationError({
        message: `The project is of type ${project.type}. Operations of type ${ProjectType.SecretManager} are not allowed.`
      });
    }
    return project;
  }

  toPermission({
    project,
    usesNewPrivilegeSystem
  }: {
    project: Project;
    usesNewPrivilegeSystem: boolean;
  }): ProjectPermission {
    return ProjectPermission.forServiceToken({
      project,
      scopes: this.scopes,
      permissions: this.permissions,
      usesNewPrivilegeSystem
    });
  }

  toJSON(): TServiceTokenRecord {
    return { id: this.id, projectId: this.projectId, scopes: this.scopes, permissions: [...this.permissions] };
  }
}
