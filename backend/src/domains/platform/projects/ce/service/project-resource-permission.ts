import { AbilityTuple } from "@casl/ability";

import {
  ActorGrants,
  createAbility,
  Membership,
  Permission,
  TPermissionRule
} from "@app/domains/platform/access-control/ce/module";

// What an actor may do on a resource inside a project, from its memberships on the resource.
export class ProjectResourcePermission<TSet extends AbilityTuple> extends Permission<TSet> {
  private constructor(
    rules: TPermissionRule<TSet>[],
    // What it was built from, for code that still reads the legacy membership rows.
    readonly grants: ActorGrants,
    // True when the actor has no role on the resource and gets the project-admin fallback only.
    readonly isImplicitAdmin: boolean,
    readonly isProjectAdmin: boolean
  ) {
    super(createAbility<TSet>(rules));
  }

  static build<T extends AbilityTuple>(input: {
    rules: TPermissionRule<T>[];
    grants: ActorGrants;
    isImplicitAdmin: boolean;
    isProjectAdmin: boolean;
  }): ProjectResourcePermission<T> {
    return new ProjectResourcePermission<T>(input.rules, input.grants, input.isImplicitAdmin, input.isProjectAdmin);
  }

  get memberships(): Membership[] {
    return this.grants.memberships;
  }

  hasRole({ slug }: { slug: string }): boolean {
    return this.grants.hasActiveRole(slug);
  }
}
