import { ProjectType } from "@app/db/schemas";
import { PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { Project, ProjectPermission } from "@app/domains/platform/projects/ce/module";

export type TServiceTokenRecord = {
  id: string;
  projectId: string;
  scopes: unknown;
  permissions: string[];
};

// A legacy Secret Manager service token: bound to one project, with the environment and path scopes and the
// permissions it was issued with.
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

  // Refuses a token whose project is gone, used for another project or org than the request's, or whose project is
  // not a Secret Manager project. `project` is the token's own project, null when it no longer exists. Returns it.
  assertUsableIn({
    project,
    projectId,
    orgId
  }: {
    project: Project | null;
    projectId: string;
    orgId: string;
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
    if (project.type !== ProjectType.SecretManager) {
      throw new RuleViolationError({
        message: `The project is of type ${project.type}. Operations of type ${ProjectType.SecretManager} are not allowed.`
      });
    }
    return project;
  }

  toPermission(project: Project): ProjectPermission {
    return ProjectPermission.forServiceToken({ project, scopes: this.scopes, permissions: this.permissions });
  }

  toJSON(): TServiceTokenRecord {
    return { id: this.id, projectId: this.projectId, scopes: this.scopes, permissions: [...this.permissions] };
  }
}
