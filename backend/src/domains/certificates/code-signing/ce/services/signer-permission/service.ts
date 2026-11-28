import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ProjectResourcePermission, TProjectResourcePermissionService } from "@app/domains/platform/projects/ce/module";

import { SignerPermissionSet } from "../../models/permissions/signer-roles";
import { SignerRoles } from "../../models/signer-resource-roles";

export type TGetSignerPermissionInput = {
  actor: TActorContext;
  projectId: string;
  signerId: string;
};

export type TSignerPermissionService = {
  // Project admins get the project-admin rules on top of their signer roles.
  getSignerPermission(input: TGetSignerPermissionInput): Promise<ProjectResourcePermission<SignerPermissionSet>>;
};

export class SignerPermissionService implements TSignerPermissionService {
  private readonly roles = new SignerRoles();

  constructor(private readonly projectResourcePermissionService: TProjectResourcePermissionService) {}

  getSignerPermission({
    actor,
    projectId,
    signerId
  }: TGetSignerPermissionInput): Promise<ProjectResourcePermission<SignerPermissionSet>> {
    return this.projectResourcePermissionService.getResourcePermission<SignerPermissionSet>({
      actor,
      projectId,
      // Signers live in Certificate Manager projects.
      type: ProjectType.CertificateManager,
      resources: [{ resourceType: ResourceType.Signer, resourceId: signerId }],
      roles: this.roles
    });
  }
}
