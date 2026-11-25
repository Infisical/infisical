import { ServiceTokenScopes } from "@app/db/schemas";
import {
  ActorGrants,
  ActorPermission,
  Membership,
  Permission,
  TRuleSource,
  RuleIdentity,
  RuleSet
} from "@app/domains/platform/access-control/ce/module";
import { delegatedOauthScopesOf, TPrincipal } from "@app/lib/auth/principal";

import { projectOauthAllowlist } from "./permissions/project-oauth-scopes";
import { buildServiceTokenProjectPermission, ProjectPermissionSet } from "./permissions/project-permission-set";
import { Project } from "./project";

// What an actor may do in one project, with the project and the memberships it was built from.
export class ProjectPermission extends ActorPermission<ProjectPermissionSet> {
  private constructor(
    rules: TRuleSource,
    readonly project: Project,
    // What it was built from, for code that still reads the membership rows.
    readonly grants: ActorGrants,
    // A delegated OAuth token holds no roles of its own: it only borrows what its scopes allow.
    private readonly isDelegated: boolean,
    usesNewPrivilegeSystem: boolean
  ) {
    super(Permission.abilityOf<ProjectPermissionSet>(rules), usesNewPrivilegeSystem);
  }

  // The only way to build one from role rules, so every project permission, generic or a product's, gets the same
  // last steps: fill `{{identity.*}}` placeholders, then cut the rules down to a delegated OAuth token's scopes.
  static build({
    rules,
    project,
    grants,
    principal,
    identity,
    usesNewPrivilegeSystem
  }: {
    rules: RuleSet;
    project: Project;
    grants: ActorGrants;
    principal: TPrincipal;
    identity: RuleIdentity;
    usesNewPrivilegeSystem: boolean;
  }): ProjectPermission {
    const interpolated = rules.interpolate(identity.toContext());
    const scopes = delegatedOauthScopesOf(principal);
    return new ProjectPermission(
      scopes ? interpolated.narrowTo(projectOauthAllowlist(scopes)) : interpolated,
      project,
      grants,
      Boolean(scopes),
      usesNewPrivilegeSystem
    );
  }

  // A service token gets the scopes and permissions it was issued with.
  static forServiceToken({
    project,
    scopes,
    permissions,
    usesNewPrivilegeSystem
  }: {
    project: Project;
    scopes: unknown;
    permissions: string[];
    usesNewPrivilegeSystem: boolean;
  }): ProjectPermission {
    const { rules } = buildServiceTokenProjectPermission(ServiceTokenScopes.parse(scopes || []), permissions);
    return new ProjectPermission(RuleSet.of(rules), project, ActorGrants.empty(), false, usesNewPrivilegeSystem);
  }

  get memberships(): Membership[] {
    return this.grants.memberships;
  }

  // An active role with this slug: a custom role's own slug, or a built-in slug.
  hasRole({ slug }: { slug: string }): boolean {
    return !this.isDelegated && this.grants.hasActiveRole(slug);
  }

  // An active built-in role with this slug. A custom role slugged the same never matches.
  hasBuiltInRole({ slug }: { slug: string }): boolean {
    return !this.isDelegated && this.grants.hasActiveBuiltInRole(slug);
  }

  get isAdmin(): boolean {
    return this.hasBuiltInRole({ slug: "admin" });
  }

  hasProjectEnforcement({ name }: { name: "enforceEncryptedSecretManagerSecretMetadata" }): boolean {
    return name === "enforceEncryptedSecretManagerSecretMetadata" && this.project.enforcesEncryptedSecretMetadata;
  }
}
