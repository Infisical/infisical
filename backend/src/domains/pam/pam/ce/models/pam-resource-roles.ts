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
} from "./pam-roles";

type TPamResourceRule = TPermissionRule<PamResourcePermissionSet>;

// Folder and account roles mean the same, so a folder role and an account role on it count together.
abstract class PamResourceRoles implements TResourceRoles<PamResourcePermissionSet> {
  abstract readonly resourceType: ResourceType;

  // PamResourceRole in ee/services/pam/pam-enums.ts.
  private readonly builtInRoles = new Map<string, TPamResourceRule[]>([
    ["admin", pamResourceAdminPermissions],
    ["operator", pamResourceOperatorPermissions],
    ["connector", pamResourceConnectorPermissions],
    ["auditor", pamResourceAuditorPermissions]
  ]);

  // A PAM project admin administers the product, not each folder: it gets nothing on a folder or account it holds no
  // role on.
  private readonly adminRules: TPamResourceRule[] = [];

  // PAM issues no custom role, so "custom" is refused like any other slug it does not define.
  rulesFor(grant: Grant): TPamResourceRule[] {
    const slug = grant.builtInSlug() ?? grant.toJSON().slug;
    const rules = this.builtInRoles.get(slug);
    if (!rules) throw new EntityNotFoundError({ name: "PamRoleInvalid", message: `PAM role '${slug}' not found` });
    return rules;
  }

  projectAdminRules(): TPamResourceRule[] {
    return this.adminRules;
  }

  // The rules of a role a membership holds, or none for a slug PAM does not define.
  rulesOrNoneFor(grant: Grant): TPamResourceRule[] {
    return this.builtInRoles.get(grant.builtInSlug() ?? grant.toJSON().slug) ?? [];
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
