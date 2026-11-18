import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ProjectResourcePermission, TProjectResourcePermissionService } from "@app/domains/platform/projects/ce/module";

import { ApplicationRoles } from "../../models/application-resource-roles";
import { ApplicationPermissionSet } from "../../models/application-roles";

export type TGetApplicationPermissionInput = {
  actor: TActorContext;
  projectId: string;
  applicationId: string;
};

export type TApplicationPermissionService = {
  // What the actor may do on one certificate application: its application roles, with the project-admin rules on
  // top for a project admin.
  getApplicationPermission(
    input: TGetApplicationPermissionInput
  ): Promise<ProjectResourcePermission<ApplicationPermissionSet>>;
};

export class ApplicationPermissionService implements TApplicationPermissionService {
  private readonly roles = new ApplicationRoles();

  constructor(private readonly projectResourcePermissionService: TProjectResourcePermissionService) {}

  getApplicationPermission({
    actor,
    projectId,
    applicationId
  }: TGetApplicationPermissionInput): Promise<ProjectResourcePermission<ApplicationPermissionSet>> {
    return this.projectResourcePermissionService.getResourcePermission<ApplicationPermissionSet>({
      actor,
      projectId,
      type: ProjectType.CertificateManager,
      resources: [{ resourceType: ResourceType.CertificateApplication, resourceId: applicationId }],
      roles: this.roles
    });
  }
}
