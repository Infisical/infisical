import { TProjectResourcePermissionService } from "@app/domains/platform/projects/ce/module";

import { SignerPermissionService, TSignerPermissionService } from "./services/signer-permission/service";

export * from "./models/signer-resource-roles";
export * from "./models/permissions/signer-roles";
export type { TGetSignerPermissionInput, TSignerPermissionService } from "./services/signer-permission/service";

export type TCodeSigningDeps = {
  projectResourcePermissionService: TProjectResourcePermissionService;
};

export class CodeSigningModule {
  readonly signerPermissionService: TSignerPermissionService;

  constructor({ projectResourcePermissionService }: TCodeSigningDeps) {
    this.signerPermissionService = new SignerPermissionService(projectResourcePermissionService);
  }
}
