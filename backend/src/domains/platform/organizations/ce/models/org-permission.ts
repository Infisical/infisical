import {
  ActorGrants,
  ActorPermission,
  Grant,
  Membership,
  Permission,
  RuleSet,
  TRuleSource,
  RuleIdentity
} from "@app/domains/platform/access-control/ce/module";
import { OauthScope } from "@app/lib/auth/oauth-scopes";
import { delegatedOauthScopesOf, TPrincipal } from "@app/lib/auth/principal";

import { OrgRoles } from "./org-roles";
import { OrgPermissionSet, OrgPermissionSsoActions, OrgPermissionSubjects } from "./permissions/org-permission-set";

// What each delegated OAuth scope allows on org subjects. No scope reaches org subjects yet, so a delegated token
// keeps only its deny rules at the org level.
const ORG_OAUTH_SCOPE_RULES: Record<OauthScope, { subject: OrgPermissionSubjects; actions: string[] }[]> = {
  [OauthScope.SecretsRead]: []
};

const oauthAllowlist = (scopes: string[]) =>
  RuleSet.allowlistOf(scopes.flatMap((scope) => ORG_OAUTH_SCOPE_RULES[scope as OauthScope] ?? []));

// What an actor may do in an org, with the memberships it was built from.
export class OrgPermission extends ActorPermission<OrgPermissionSet> {
  private constructor(
    rules: TRuleSource,
    // What it was built from, for code that still reads the membership rows.
    readonly grants: ActorGrants,
    // A delegated OAuth token holds no roles of its own: it only borrows what its scopes allow.
    private readonly isDelegated: boolean,
    usesNewPrivilegeSystem: boolean
  ) {
    super(Permission.abilityOf<OrgPermissionSet>(rules), usesNewPrivilegeSystem);
  }

  // The actor's org roles and privileges together. A delegated OAuth token keeps only what its scopes allow; the
  // full roles decide everything else (SSO bypass included), since they belong to the user, not to the client.
  static fromGrants({
    grants,
    principal,
    usesNewPrivilegeSystem
  }: {
    grants: ActorGrants;
    principal: TPrincipal;
    usesNewPrivilegeSystem: boolean;
  }): OrgPermission {
    const rules = OrgPermission.roleRules(grants);
    const scopes = delegatedOauthScopesOf(principal);
    return new OrgPermission(
      scopes ? rules.narrowTo(oauthAllowlist(scopes)) : rules,
      grants,
      Boolean(scopes),
      usesNewPrivilegeSystem
    );
  }

  // Whether these org roles and privileges let their holder through the org's SSO enforcement.
  static grantsSsoBypass(grants: ActorGrants): boolean {
    return Permission.fromRules<OrgPermissionSet>({ rules: OrgPermission.roleRules(grants) }).can({
      action: OrgPermissionSsoActions.BypassSsoEnforcement,
      subject: OrgPermissionSubjects.Sso
    });
  }

  private static roleRules(grants: ActorGrants) {
    return RuleSet.merge(grants.active().map((grant) => OrgRoles.rulesFor(grant)));
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
    return !this.isDelegated && this.grants.hasActiveRole(slug);
  }

  // An active built-in role with this slug. A custom role slugged the same never matches.
  hasBuiltInRole({ slug }: { slug: string }): boolean {
    return !this.isDelegated && this.grants.hasActiveBuiltInRole(slug);
  }
}
