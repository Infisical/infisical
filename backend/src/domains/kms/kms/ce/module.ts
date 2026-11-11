import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { genericProjectRoles, TProductAccessRegistry } from "@app/domains/platform/projects/ce/module";

import { cryptographicOperatorPermissions } from "./service/kms-roles";

export * from "./service/kms-roles";

export type TKmsDeps = {
  productAccessRegistry: TProductAccessRegistry;
};

// The KMS product: its project roles for now. It grows as KMS (CMEK, KMIP) moves into a domain.
export class KmsModule {
  readonly name = "kms";

  constructor({ productAccessRegistry }: TKmsDeps) {
    // The generic project roles, plus the cryptographic operator, which only means something in a KMS project.
    productAccessRegistry.registerDefaultRoles({
      projectType: ProjectType.KMS,
      roles: {
        ...genericProjectRoles,
        [ProjectMembershipRole.KmsCryptographicOperator]: cryptographicOperatorPermissions
      }
    });
  }
}
