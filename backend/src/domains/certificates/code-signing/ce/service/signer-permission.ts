import { ProjectType, ResourceMembershipRole, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import type { TProjectsDomain, TResourceRoles } from "@app/domains/platform/projects/ce/module";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import {
  projectAdminSignerFallbackPermissions,
  signerAdminPermissions,
  signerAuditorPermissions,
  signerOperatorPermissions,
  SignerPermissionSet
} from "./signer-roles";

const SIGNER_ROLES: Record<string, typeof signerAdminPermissions> = {
  [ResourceMembershipRole.Admin]: signerAdminPermissions,
  [ResourceMembershipRole.Operator]: signerOperatorPermissions,
  [ResourceMembershipRole.Auditor]: signerAuditorPermissions
};

export const signerRoles: TResourceRoles<SignerPermissionSet> = {
  resolveRole: (role) => {
    if (role === ResourceMembershipRole.Custom) {
      throw new BadRequestError({ message: "Custom resource-level roles are not supported yet" });
    }
    const rules = SIGNER_ROLES[role];
    if (!rules) throw new NotFoundError({ name: "SignerRoleInvalid", message: `Signer role '${role}' not found` });
    return rules;
  },
  projectAdminFallback: projectAdminSignerFallbackPermissions
};

// What the actor may do on one signer: its signer role, plus the fallback set when it is a project admin.
export const getSignerPermission = (
  projectsDomain: Pick<TProjectsDomain, "getProjectResourcePermission">,
  { actor, projectId, signerId }: { actor: TActorContext; projectId: string; signerId: string }
) =>
  projectsDomain.getProjectResourcePermission<SignerPermissionSet>({
    actor,
    projectId,
    // Signers live in Certificate Manager projects.
    type: ProjectType.CertificateManager,
    resources: [{ resourceType: ResourceType.Signer, resourceId: signerId }],
    roles: signerRoles
  });
