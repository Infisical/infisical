import { ProjectType } from "@app/db/schemas";
import { TActorGrantsService } from "@app/domains/platform/access-control/ce/module";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TProjectResourcePermissionService, TProjectsService } from "@app/domains/platform/projects/ce/module";

import { PamPermissionService, TPamPermissionService } from "./services/pam-permission/service";

export * from "./models/pam-project-roles";
export * from "./models/pam-resource-roles";
export * from "./models/pam-roles";
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

// The PAM product: its usage counter, its roles (PamProjectRoles, which domains.ts hands to Projects) and its folder
// and account permission for now.
export class PamModule {
  readonly pamPermissionService: TPamPermissionService;

  readonly usageCounters: TUsageCounter[];

  constructor({ projectsService, projectResourcePermissionService, actorGrantsService }: TPamDeps) {
    this.pamPermissionService = new PamPermissionService(projectResourcePermissionService, actorGrantsService);
    this.usageCounters = [
      {
        meter: Meter.PamIdentities,
        count: (orgId) => projectsService.countProjectIdentities(ProjectType.PAM, orgId)
      }
    ];
  }
}
