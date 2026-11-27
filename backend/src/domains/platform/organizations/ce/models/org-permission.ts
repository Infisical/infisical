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
import {
  OrgPermissionActions,
  OrgPermissionProjectActions,
  OrgPermissionSet,
  OrgPermissionSsoActions,
  OrgPermissionSubjects
} from "./permissions/org-permission-set";

// A delegated OAuth token keeps the user's org rules only where a granted scope covers them.
export const ORG_OAUTH_SCOPE_RULES: Record<OauthScope, { subject: OrgPermissionSubjects; actions: string[] }[]> = {
  [OauthScope.SecretsDescribe]: [],
  [OauthScope.SecretsRead]: [],
  // Creating a project takes either of these, depending on how the user's org role was written.
  [OauthScope.SecretsWrite]: [
    { subject: OrgPermissionSubjects.Workspace, actions: [OrgPermissionActions.Create] },
    { subject: OrgPermissionSubjects.Project, actions: [OrgPermissionProjectActions.Create] }
  ]
};

const oauthAllowlist = (scopes: string[]) =>
  RuleSet.allowlistOf(scopes.flatMap((scope) => ORG_OAUTH_SCOPE_RULES[scope as OauthScope] ?? []));

export class OrgPermission extends ActorPermission<OrgPermissionSet> {
  private constructor(
    rules: TRuleSource,
    // Kept for code that still reads the membership rows.
    readonly grants: ActorGrants,
    // Delegated OAuth tokens hold no roles of their own, they only borrow what their scopes allow.
    private readonly isDelegated: boolean,
    usesNewPrivilegeSystem: boolean
  ) {
    super(Permission.abilityOf<OrgPermissionSet>(rules), usesNewPrivilegeSystem);
  }

  // Delegated tokens get narrowed to their scopes. Everything else (SSO bypass too) comes from the full roles,
  // since those belong to the user, not the client.
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

  static grantsSsoBypass(grants: ActorGrants): boolean {
    return Permission.fromRules<OrgPermissionSet>({ rules: OrgPermission.roleRules(grants) }).can({
      action: OrgPermissionSsoActions.BypassSsoEnforcement,
      subject: OrgPermissionSubjects.Sso
    });
  }

  private static roleRules(grants: ActorGrants) {
    return RuleSet.merge(grants.active().map((grant) => OrgRoles.rulesFor(grant)));
  }

  // Single role or privilege, `{{identity.*}}` filled from a stored identity. For privilege boundaries and listings.
  static forGrant({ grant, identity }: { grant: Grant; identity?: RuleIdentity }): Permission<OrgPermissionSet> {
    const rules = RuleSet.of(OrgRoles.rulesFor(grant));
    return Permission.fromRules<OrgPermissionSet>({
      rules: identity ? rules.interpolateStored(identity.toContext()) : rules
    });
  }

  get memberships(): Membership[] {
    return this.grants.memberships;
  }

  // Matches a custom role's slug or a built-in slug.
  hasRole({ slug }: { slug: string }): boolean {
    return !this.isDelegated && this.grants.hasActiveRole(slug);
  }

  // Built-in only: a custom role with the same slug never matches.
  hasBuiltInRole({ slug }: { slug: string }): boolean {
    return !this.isDelegated && this.grants.hasActiveBuiltInRole(slug);
  }
}
