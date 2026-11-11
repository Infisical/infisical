import { MongoAbility } from "@casl/ability";

import { AccessScope, OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ActorMemo } from "@app/domains/lib/actor-memo";
import {
  ActorGrants,
  buildRules,
  narrowRules,
  TAccessControlDomain,
  TPermissionRule
} from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { OrgPermission } from "./org-access";
import { orgOauthAllowlist } from "./org-oauth-scopes";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionSet,
  OrgPermissionSsoActions,
  OrgPermissionSubjects
} from "./permission/org-permission";

export type TGetOrgPermissionInput = {
  actor: TActorContext;
  // Defaults to the actor's org; any other org is refused.
  orgId?: string;
  // Refuses a sub-org for parent-only operations, and a root org for child-only ones.
  scope?: OrganizationActionScope;
};

export type TOrgPermissionServiceDeps = {
  accessControlDomain: Pick<TAccessControlDomain, "fetchGrants">;
  memo: ActorMemo<OrgPermission>;
};

const ORG_ROLES: Record<string, TPermissionRule<OrgPermissionSet>[]> = {
  [OrgMembershipRole.Admin]: orgAdminPermissions,
  [OrgMembershipRole.Member]: orgMemberPermissions,
  [OrgMembershipRole.NoAccess]: orgNoAccessPermissions
};

export class OrgPermissionService {
  constructor(private readonly deps: TOrgPermissionServiceDeps) {}

  async getOrgPermission({
    actor,
    orgId = actor.org.id,
    scope = OrganizationActionScope.Any
  }: TGetOrgPermissionInput): Promise<OrgPermission> {
    const { principal } = actor;
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      throw new BadRequestError({ message: "Invalid actor provided", name: "Get org permission" });
    }
    if (orgId !== actor.org.id) {
      throw new ForbiddenRequestError({
        message: `Your token is scoped to organization with ID ${actor.org.id}, but this resource belongs to a different organization.`
      });
    }

    return this.deps.memo.getOrCompute(actor, `${orgId}:${scope}`, async () => {
      const grants = await this.deps.accessControlDomain.fetchGrants({
        actor: { type: principal.type, id: principal.id },
        scope: { scope: AccessScope.Organization, orgId }
      });
      if (!grants.hasMembership) {
        throw new ForbiddenRequestError({
          message: `You are not a member of this organization with ID ${orgId}. Please assign this ${principal.type} to the organization with the appropriate permissions, then try again.`
        });
      }

      const isChild = actor.org.rootOrgId !== actor.org.id;
      if (scope === OrganizationActionScope.ParentOrganization && isChild) {
        throw new ForbiddenRequestError({ message: "Child organization cannot do this operation" });
      }
      if (scope === OrganizationActionScope.ChildOrganization && !isChild) {
        throw new ForbiddenRequestError({ message: "Parent organization cannot do this operation" });
      }

      const rules = OrgPermissionService.orgRules(grants);

      // A delegated OAuth token keeps only what its scopes allow; a first-party session keeps everything.
      const scopes = principal.type === ActorType.USER ? principal.oauth?.scopes : undefined;
      const finalRules = scopes ? narrowRules({ rules, allowed: orgOauthAllowlist(scopes) }) : rules;

      return OrgPermission.build({ rules: finalRules, grants });
    });
  }

  // Whether the user's root org roles let it through the root org's SSO enforcement. Evaluated on its full roles:
  // the bypass belongs to the user, not to what an OAuth client was delegated.
  async canBypassSso({ userId, rootOrgId }: { userId: string; rootOrgId: string }): Promise<boolean> {
    const grants = await this.deps.accessControlDomain.fetchGrants({
      actor: { type: ActorType.USER, id: userId },
      scope: { scope: AccessScope.Organization, orgId: rootOrgId }
    });
    if (!grants.hasMembership) return false;
    return OrgPermission.build({ rules: OrgPermissionService.orgRules(grants), grants }).can({
      action: OrgPermissionSsoActions.BypassSsoEnforcement,
      subject: OrgPermissionSubjects.Sso
    });
  }

  private static orgRules(grants: ActorGrants): TPermissionRule<OrgPermissionSet>[] {
    return buildRules<MongoAbility<OrgPermissionSet>>({
      entries: grants.activeEntries(OrgMembershipRole.Custom),
      customRoleSlug: OrgMembershipRole.Custom,
      resolveRole: (role) => ORG_ROLES[role],
      onUnknownRole: (role) =>
        new NotFoundError({ name: "OrgRoleInvalid", message: `Organization role '${role}' not found` })
    });
  }
}
