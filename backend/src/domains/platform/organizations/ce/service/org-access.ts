import {
  ActorGrants,
  createAbility,
  Membership,
  Permission,
  TPermissionRule
} from "@app/domains/platform/access-control/ce/module";

import { OrgPermissionSet } from "./permission/org-permission";

// What an actor may do in an org, with the memberships it was built from.
export class OrgPermission extends Permission<OrgPermissionSet> {
  private constructor(
    rules: TPermissionRule<OrgPermissionSet>[],
    // What it was built from, for code that still reads the legacy membership rows.
    readonly grants: ActorGrants
  ) {
    super(createAbility<OrgPermissionSet>(rules));
  }

  static build({ rules, grants }: { rules: TPermissionRule<OrgPermissionSet>[]; grants: ActorGrants }): OrgPermission {
    return new OrgPermission(rules, grants);
  }

  get memberships(): Membership[] {
    return this.grants.memberships;
  }

  // An active role with this slug: a custom role's own slug, or a built-in slug.
  hasRole({ slug }: { slug: string }): boolean {
    return this.grants.hasActiveRole(slug);
  }

  // An active built-in role with this slug. A custom role slugged the same never matches.
  hasBuiltInRole({ slug }: { slug: string }): boolean {
    return this.grants.hasActiveBuiltInRole(slug);
  }
}
