import { TProjectPermissionService } from "@app/domains/platform/projects/ce/module";

import { KmsPermissionService, TKmsPermissionService } from "./services/kms-permission/service";

export * from "./models/kms-project-roles";
export type { TGetKmsPermissionInput, TKmsPermissionService } from "./services/kms-permission/service";

export type TKmsDeps = {
  projectPermissionService: TProjectPermissionService;
};

// The KMS product: its project roles (kmsProjectRoles, which domains.ts hands to Projects) and permission for now.
export class KmsModule {
  readonly kmsPermissionService: TKmsPermissionService;

  constructor({ projectPermissionService }: TKmsDeps) {
    this.kmsPermissionService = new KmsPermissionService(projectPermissionService);
  }
}
