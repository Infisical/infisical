import { ProjectType } from "@app/db/schemas";
import { TActorGrantsService } from "@app/domains/platform/access-control/ce/module";
import { TProductUsageCounters } from "@app/domains/platform/license/ce/module";
import { TProjectResourcePermissionService, TProjectsService } from "@app/domains/platform/projects/ce/module";

import { PamPermissionService, TPamPermissionService } from "./services/pam-permission/service";

export * from "./models/pam-project-roles";
export * from "./models/pam-resource-roles";
export * from "./models/permissions/pam-roles";
export { pamActorKey } from "./services/pam-permission/service";
export type {
  TAccountAccessInput,
  TGetPamPermissionInput,
  TPamAccountRef,
  TPamActionFilter,
  TPamPermissionService,
  TPamPermissionTransaction,
  TPamResourceIds
} from "./services/pam-permission/service";

export type TPamDeps = {
  projectsService: TProjectsService;
  projectResourcePermissionService: TProjectResourcePermissionService;
  actorGrantsService: TActorGrantsService;
};

export class PamModule {
  readonly pamPermissionService: TPamPermissionService;

  readonly usageCounters: Pick<TProductUsageCounters, "pam_identities">;

  constructor({ projectsService, projectResourcePermissionService, actorGrantsService }: TPamDeps) {
    this.pamPermissionService = new PamPermissionService(projectResourcePermissionService, actorGrantsService);
    this.usageCounters = {
      pam_identities: (orgId) => projectsService.countProjectIdentities(ProjectType.PAM, orgId)
    };
  }
}
