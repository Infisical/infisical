import { ResourceMembershipRole, ResourceType } from "@app/db/schemas";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { Grant, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { TResourceRoles } from "@app/domains/platform/projects/ce/module";

import {
  projectAdminSignerFallbackPermissions,
  signerAdminPermissions,
  signerAuditorPermissions,
  signerOperatorPermissions,
  SignerPermissionSet
} from "./signer-roles";

type TSignerRule = TPermissionRule<SignerPermissionSet>;

// What the roles held on a signer grant.
export class SignerRoles implements TResourceRoles<SignerPermissionSet> {
  readonly resourceType = ResourceType.Signer;

  private readonly builtInRoles = new Map<string, TSignerRule[]>([
    [ResourceMembershipRole.Admin, signerAdminPermissions],
    [ResourceMembershipRole.Operator, signerOperatorPermissions],
    [ResourceMembershipRole.Auditor, signerAuditorPermissions]
  ]);

  private readonly adminRules = projectAdminSignerFallbackPermissions;

  rulesFor(grant: Grant): TSignerRule[] {
    if (grant.isCustom()) {
      throw new RuleViolationError({ message: "Custom resource-level roles are not supported yet" });
    }
    const slug = grant.builtInSlug() as string;
    const rules = this.builtInRoles.get(slug);
    if (!rules)
      throw new EntityNotFoundError({ name: "SignerRoleInvalid", message: `Signer role '${slug}' not found` });
    return rules;
  }

  projectAdminRules(): TSignerRule[] {
    return this.adminRules;
  }
}
