import {
  ActorGrants,
  createAbility,
  interpolatePermissionRules,
  Membership,
  narrowRules,
  Permission,
  TPermissionRule
} from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import type { TPrincipal } from "@app/lib/auth/principal";

import { Project } from "../model/project";
import { projectOauthAllowlist } from "./permission/project-oauth-scopes";
import { ProjectPermissionSet } from "./permission/project-permission";

// What `{{identity.*}}` placeholders in a custom role or privilege resolve to.
export type TProjectIdentityContext = {
  id: string;
  username: string;
  metadata: Record<string, string>;
  auth: Record<string, unknown>;
};

export type TBuildProjectPermissionInput = {
  project: Project;
  grants: ActorGrants;
  // In order, as the owner composed them: the last matching rule decides.
  rules: TPermissionRule<ProjectPermissionSet>[];
  principal: TPrincipal;
  identity: TProjectIdentityContext;
};

// What an actor may do in one project, with the project and the memberships it was built from.
export class ProjectPermission extends Permission<ProjectPermissionSet> {
  private constructor(
    rules: TPermissionRule<ProjectPermissionSet>[],
    readonly project: Project,
    private readonly grants: ActorGrants
  ) {
    super(createAbility<ProjectPermissionSet>(rules));
  }

  // The only way to make one, so every project permission, generic or a product's, gets the same last steps: fill
  // `{{identity.*}}` placeholders, then cut the rules down to a delegated OAuth token's scopes.
  static build({ project, grants, rules, principal, identity }: TBuildProjectPermissionInput): ProjectPermission {
    const interpolated = interpolatePermissionRules(rules, { identity });
    const scopes = principal.type === ActorType.USER ? principal.oauth?.scopes : undefined;
    const narrowed = scopes
      ? narrowRules({ rules: interpolated, allowed: projectOauthAllowlist(scopes) })
      : interpolated;
    return new ProjectPermission(narrowed, project, grants);
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

  get isAdmin(): boolean {
    return this.hasBuiltInRole({ slug: "admin" });
  }

  hasProjectEnforcement({ name }: { name: "enforceEncryptedSecretManagerSecretMetadata" }): boolean {
    return name === "enforceEncryptedSecretManagerSecretMetadata" && this.project.enforcesEncryptedSecretMetadata;
  }
}
