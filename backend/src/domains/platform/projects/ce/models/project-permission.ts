import { ServiceTokenScopes } from "@app/db/schemas";
import {
  ActorGrants,
  Membership,
  Permission,
  TRuleSource,
  RuleIdentity,
  RuleSet
} from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

import { Project } from "./project";
import { projectOauthAllowlist } from "./project-oauth-scopes";
import { buildServiceTokenProjectPermission, ProjectPermissionSet } from "./project-permission-set";

// What an actor may do in one project, with the project and the memberships it was built from.
export class ProjectPermission extends Permission<ProjectPermissionSet> {
  private constructor(
    rules: TRuleSource,
    readonly project: Project,
    // What it was built from, for code that still reads the membership rows.
    readonly grants: ActorGrants,
    // A delegated OAuth token holds no roles of its own: it only borrows what its scopes allow.
    private readonly isDelegated: boolean
  ) {
    super(Permission.abilityOf<ProjectPermissionSet>(rules));
  }

  // The only way to build one from role rules, so every project permission, generic or a product's, gets the same
  // last steps: fill `{{identity.*}}` placeholders, then cut the rules down to a delegated OAuth token's scopes.
  static build({
    rules,
    project,
    grants,
    principal,
    identity
  }: {
    rules: RuleSet;
    project: Project;
    grants: ActorGrants;
    principal: TPrincipal;
    identity: RuleIdentity;
  }): ProjectPermission {
    const interpolated = rules.interpolate(identity.toContext());
    const scopes = principal.type === ActorType.USER ? principal.oauth?.scopes : undefined;
    return new ProjectPermission(
      scopes ? interpolated.narrowTo(projectOauthAllowlist(scopes)) : interpolated,
      project,
      grants,
      Boolean(scopes)
    );
  }

  // A service token gets the scopes and permissions it was issued with.
  static forServiceToken({
    project,
    scopes,
    permissions
  }: {
    project: Project;
    scopes: unknown;
    permissions: string[];
  }): ProjectPermission {
    const { rules } = buildServiceTokenProjectPermission(ServiceTokenScopes.parse(scopes || []), permissions);
    return new ProjectPermission(RuleSet.of(rules), project, ActorGrants.empty(), false);
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
