/* eslint-disable max-classes-per-file */
import { ResourceType } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Grant, Permission, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { TResourceRoles } from "@app/domains/platform/projects/ce/module";

import {
  pamResourceAdminPermissions,
  pamResourceAuditorPermissions,
  pamResourceConnectorPermissions,
  pamResourceOperatorPermissions,
  PamResourcePermissionActions,
  PamResourcePermissionSet,
  PamResourcePermissionSub
} from "./permissions/pam-roles";

type TPamResourceRule = TPermissionRule<PamResourcePermissionSet>;

// Folder and account roles mean the same, so a folder role and an account role on it count together.
abstract class PamResourceRoles implements TResourceRoles<PamResourcePermissionSet> {
  abstract readonly resourceType: ResourceType;

  // Mirrors PamResourceRole in ee/services/pam/pam-enums.ts.
  private readonly builtInRoles = new Map<string, TPamResourceRule[]>([
    ["admin", pamResourceAdminPermissions],
    ["operator", pamResourceOperatorPermissions],
    ["connector", pamResourceConnectorPermissions],
    ["auditor", pamResourceAuditorPermissions]
  ]);

  // A PAM project admin runs the product, not each folder, so it gets nothing on a folder or account without a role.
  private readonly adminRules: TPamResourceRule[] = [];

  // PAM issues no custom role, so "custom" is refused like any other slug it does not define.
  rulesFor(grant: Grant): TPamResourceRule[] {
    const { slug } = grant.toJSON();
    const rules = this.builtInRoles.get(slug);
    if (!rules) throw new EntityNotFoundError({ name: "PamRoleInvalid", message: `PAM role '${slug}' not found` });
    return rules;
  }

  projectAdminRules(): TPamResourceRule[] {
    return this.adminRules;
  }

  // Unknown slugs get no rules instead of throwing.
  rulesOrNoneFor(grant: Grant): TPamResourceRule[] {
    return this.builtInRoles.get(grant.toJSON().slug) ?? [];
  }

  allows(grant: Grant, action: PamResourcePermissionActions): boolean {
    return Permission.fromRules<PamResourcePermissionSet>({ rules: this.rulesOrNoneFor(grant) }).can({
      action,
      subject: PamResourcePermissionSub.PamResource
    });
  }
}

export class PamFolderRoles extends PamResourceRoles {
  readonly resourceType = ResourceType.PamFolder;
}

export class PamAccountRoles extends PamResourceRoles {
  readonly resourceType = ResourceType.PamAccount;
}
