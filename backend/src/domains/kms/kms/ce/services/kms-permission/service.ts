import { ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ProjectPermission, TProjectPermissionService } from "@app/domains/platform/projects/ce/module";

export type TGetKmsPermissionInput = {
  actor: TActorContext;
  projectId: string;
};

export type TKmsPermissionService = {
  // Refuses a project of another type.
  getKmsPermission(input: TGetKmsPermissionInput): Promise<ProjectPermission>;
};

export class KmsPermissionService implements TKmsPermissionService {
  constructor(private readonly projectPermissionService: TProjectPermissionService) {}

  getKmsPermission({ actor, projectId }: TGetKmsPermissionInput): Promise<ProjectPermission> {
    return this.projectPermissionService.getProjectPermission({ actor, projectId, type: ProjectType.KMS });
  }
}
