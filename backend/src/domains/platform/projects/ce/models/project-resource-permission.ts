import { AbilityTuple } from "@casl/ability";

import {
  ActorGrants,
  Grant,
  Membership,
  Permission,
  RuleSet,
  TRuleSource,
  TPermissionRule
} from "@app/domains/platform/access-control/ce/module";

// What the roles held on one kind of resource inside a project grant (a PAM folder or account, a certificate
// application, a signer, an access bundle). The product implements it and passes it with each check.
export type TResourceRoles<TSet extends AbilityTuple> = {
  readonly resourceType: string;
  // The rules for a role; throws for one the product does not define.
  rulesFor(grant: Grant): TPermissionRule<TSet>[];
  // What a project admin gets on a resource it holds no role on, and on top of its roles where it holds some.
  projectAdminRules(): TPermissionRule<TSet>[];
};

// What an actor may do on resources inside a project, from its memberships on them.
export class ProjectResourcePermission<TSet extends AbilityTuple> extends Permission<TSet> {
  private constructor(
    rules: TRuleSource,
    // What it was built from, for code that still reads the membership rows.
    readonly grants: ActorGrants,
    // True when the actor holds no role on the resource and gets the project-admin rules only.
    readonly isImplicitAdmin: boolean,
    readonly isProjectAdmin: boolean
  ) {
    super(Permission.abilityOf<TSet>(rules));
  }

  // The roles held on the resources together, then the project-admin rules for a project admin.
  static fromGrants<T extends AbilityTuple>({
    grants,
    roles,
    isProjectAdmin
  }: {
    grants: ActorGrants;
    roles: TResourceRoles<T>;
    isProjectAdmin: boolean;
  }): ProjectResourcePermission<T> {
    const held = RuleSet.merge(grants.active().map((grant) => roles.rulesFor(grant)));
    const rules = isProjectAdmin ? held.then(RuleSet.of(roles.projectAdminRules())) : held;
    return new ProjectResourcePermission<T>(rules, grants, false, isProjectAdmin);
  }

  // A project admin with no role on the resource.
  static implicitAdmin<T extends AbilityTuple>({ roles }: { roles: TResourceRoles<T> }): ProjectResourcePermission<T> {
    return new ProjectResourcePermission<T>(RuleSet.of(roles.projectAdminRules()), ActorGrants.empty(), true, true);
  }

  // Allows nothing: what a delegated OAuth token gets, since no scope covers resource memberships.
  static none<T extends AbilityTuple>(): ProjectResourcePermission<T> {
    return new ProjectResourcePermission<T>(RuleSet.empty(), ActorGrants.empty(), false, false);
  }

  get memberships(): Membership[] {
    return this.grants.memberships;
  }

  hasRole({ slug }: { slug: string }): boolean {
    return this.grants.hasActiveRole(slug);
  }
}
