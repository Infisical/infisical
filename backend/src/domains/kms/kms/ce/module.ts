import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import {
  genericProjectRoles,
  ProjectPermission,
  TProductAccessRegistry,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";

import { cryptographicOperatorPermissions } from "./service/kms-roles";

export * from "./service/kms-roles";

export type TKmsDomain = {
  // What the actor may do in a KMS project.
  getKmsPermission: (input: { actor: TActorContext; projectId: string }) => Promise<ProjectPermission>;
};

export type TKmsDeps = {
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  productAccessRegistry: TProductAccessRegistry;
};

// The KMS product: its project roles and permission for now. It grows as KMS (CMEK, KMIP) moves into a domain.
export class KmsModule {
  readonly name = "kms";

  readonly service: TKmsDomain;

  constructor({ projectsDomain, productAccessRegistry }: TKmsDeps) {
    // The generic project roles, plus the cryptographic operator, which only means something in a KMS project.
    productAccessRegistry.registerDefaultRoles({
      projectType: ProjectType.KMS,
      roles: {
        ...genericProjectRoles,
        [ProjectMembershipRole.KmsCryptographicOperator]: cryptographicOperatorPermissions
      }
    });
    this.service = {
      getKmsPermission: ({ actor, projectId }) =>
        projectsDomain.getProjectPermission({ actor, projectId, type: ProjectType.KMS })
    };
  }
}
