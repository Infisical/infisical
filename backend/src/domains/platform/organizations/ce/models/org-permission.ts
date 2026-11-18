import {
  ActorGrants,
  Grant,
  Membership,
  Permission,
  RuleSet,
  TRuleSource,
  RuleIdentity
} from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { OauthScope } from "@app/lib/auth/oauth-scopes";
import type { TPrincipal } from "@app/lib/auth/principal";

import { OrgPermissionSet, OrgPermissionSsoActions, OrgPermissionSubjects } from "./org-permission-set";
import { OrgRoles } from "./org-roles";

// What each delegated OAuth scope allows on org subjects. No scope reaches org subjects yet, so a delegated token
// keeps only its deny rules at the org level.
const ORG_OAUTH_SCOPE_RULES: Record<OauthScope, { subject: OrgPermissionSubjects; actions: string[] }[]> = {
  [OauthScope.SecretsRead]: []
};

const oauthAllowlist = (scopes: string[]): Map<string, Set<string>> => {
  const allowed = new Map<string, Set<string>>();
  scopes
    .flatMap((scope) => ORG_OAUTH_SCOPE_RULES[scope as OauthScope] ?? [])
    .forEach(({ subject, actions }) => {
      const existing = allowed.get(subject) ?? new Set<string>();
      actions.forEach((action) => existing.add(action));
      allowed.set(subject, existing);
    });
  return allowed;
};

// What an actor may do in an org, with the memberships it was built from.
export class OrgPermission extends Permission<OrgPermissionSet> {
  private constructor(
    rules: TRuleSource,
    // What it was built from, for code that still reads the membership rows.
    readonly grants: ActorGrants
  ) {
    super(Permission.abilityOf<OrgPermissionSet>(rules));
  }

  // The actor's org roles and privileges together. A delegated OAuth token keeps only what its scopes allow; the
  // full roles decide everything else (SSO bypass included), since they belong to the user, not to the client.
  static fromGrants({ grants, principal }: { grants: ActorGrants; principal?: TPrincipal }): OrgPermission {
    const rules = RuleSet.merge(grants.active().map((grant) => OrgRoles.rulesFor(grant)));
    const scopes = principal?.type === ActorType.USER ? principal.oauth?.scopes : undefined;
    return new OrgPermission(scopes ? rules.narrowTo(oauthAllowlist(scopes)) : rules, grants);
  }

  // One role or privilege on its own, with `{{identity.*}}` filled from a stored identity: for privilege boundaries
  // and member listings.
  static forGrant({ grant, identity }: { grant: Grant; identity?: RuleIdentity }): Permission<OrgPermissionSet> {
    const rules = RuleSet.of(OrgRoles.rulesFor(grant));
    return Permission.fromRules<OrgPermissionSet>({
      rules: identity ? rules.interpolateStored(identity.toContext()) : rules
    });
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

  canBypassSso(): boolean {
    return this.can({ action: OrgPermissionSsoActions.BypassSsoEnforcement, subject: OrgPermissionSubjects.Sso });
  }
}
