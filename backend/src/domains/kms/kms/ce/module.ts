import { TProjectPermissionService } from "@app/domains/platform/projects/ce/module";

import { KmsPermissionService, TKmsPermissionService } from "./services/kms-permission/service";

export * from "./models/permissions/kms-project-roles";
export type { TGetKmsPermissionInput, TKmsPermissionService } from "./services/kms-permission/service";

export type TKmsDeps = {
  projectPermissionService: TProjectPermissionService;
};

export class KmsModule {
  readonly kmsPermissionService: TKmsPermissionService;

  constructor({ projectPermissionService }: TKmsDeps) {
    this.kmsPermissionService = new KmsPermissionService(projectPermissionService);
  }
}
