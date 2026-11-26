import { AbilityTuple } from "@casl/ability";

import {
  ActorGrants,
  Grant,
  Membership,
  Permission,
  RuleSet,
  TRuleSource,
  TPermissionRule,
  TRuleLike
} from "@app/domains/platform/access-control/ce/module";

import { Project } from "./project";

// Role rules for one resource kind in a project (PAM folder/account, cert application, signer, access bundle).
// The product implements it and passes it with each check.
export type TResourceRoles<TSet extends AbilityTuple> = {
  readonly resourceType: string;
  // Throws for a role the product doesn't define.
  rulesFor(grant: Grant): TPermissionRule<TSet>[];
  // What a project admin gets on a resource with no role, and on top of its roles when it has some.
  projectAdminRules(): TPermissionRule<TSet>[];
};

// TS can't resolve a CASL raw rule over a generic ability set, so cast to the plain rule type.
const asRules = <T extends AbilityTuple>(rules: TPermissionRule<T>[]) => rules as TRuleLike[];

export class ProjectResourcePermission<TSet extends AbilityTuple> extends Permission<TSet> {
  private constructor(
    rules: TRuleSource,
    // Kept for code that still reads membership rows.
    readonly grants: ActorGrants,
    // No role on the resource, only the project-admin rules.
    readonly isImplicitAdmin: boolean,
    readonly isProjectAdmin: boolean,
    // Only set when the actor is a project member.
    readonly project: Project | null = null
  ) {
    super(Permission.abilityOf<TSet>(rules));
  }

  // Merged resource roles, with project-admin rules on top for project admins.
  static fromGrants<T extends AbilityTuple>({
    grants,
    roles,
    isProjectAdmin,
    project = null
  }: {
    grants: ActorGrants;
    roles: TResourceRoles<T>;
    isProjectAdmin: boolean;
    project?: Project | null;
  }): ProjectResourcePermission<T> {
    const held = RuleSet.merge(grants.active().map((grant) => asRules(roles.rulesFor(grant))));
    const rules = isProjectAdmin ? held.then(RuleSet.of(asRules(roles.projectAdminRules()))) : held;
    return new ProjectResourcePermission<T>(rules, grants, false, isProjectAdmin, project);
  }

  static implicitAdmin<T extends AbilityTuple>({
    roles,
    project = null
  }: {
    roles: TResourceRoles<T>;
    project?: Project | null;
  }): ProjectResourcePermission<T> {
    return new ProjectResourcePermission<T>(
      RuleSet.of(asRules(roles.projectAdminRules())),
      ActorGrants.empty(),
      true,
      true,
      project
    );
  }

  // Delegated OAuth tokens get this, since no scope covers resource memberships.
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
