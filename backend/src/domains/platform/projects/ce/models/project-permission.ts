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

import { narrowToProjectOauthScopes } from "./permissions/project-oauth-scopes";
import { buildServiceTokenProjectPermission, ProjectPermissionSet } from "./permissions/project-permission-set";
import { Project } from "./project";

export class ProjectPermission extends ActorPermission<ProjectPermissionSet> {
  private constructor(
    rules: TRuleSource,
    readonly project: Project,
    // Kept for code that still reads membership rows.
    readonly grants: ActorGrants,
    // Delegated OAuth tokens have no roles of their own, only what their scopes allow.
    private readonly isDelegated: boolean,
    usesNewPrivilegeSystem: boolean
  ) {
    super(Permission.abilityOf<ProjectPermissionSet>(rules), usesNewPrivilegeSystem);
  }

  // Only way to build one from role rules, so every project permission gets the same last steps: fill
  // `{{identity.*}}` placeholders, then narrow to a delegated OAuth token's scopes.
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
      scopes ? narrowToProjectOauthScopes(interpolated, scopes) : interpolated,
      project,
      grants,
      Boolean(scopes),
      usesNewPrivilegeSystem
    );
  }

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

  // Matches custom role slugs and built-in slugs.
  hasRole({ slug }: { slug: string }): boolean {
    return !this.isDelegated && this.grants.hasActiveRole(slug);
  }

  // Built-in only; a custom role with the same slug never matches.
  hasBuiltInRole({ slug }: { slug: string }): boolean {
    return !this.isDelegated && this.grants.hasActiveBuiltInRole(slug);
  }

  hasProjectEnforcement({ name }: { name: "enforceEncryptedSecretManagerSecretMetadata" }): boolean {
    return name === "enforceEncryptedSecretManagerSecretMetadata" && this.project.enforcesEncryptedSecretMetadata;
  }
}
