import { AccessScope, OrganizationActionScope, OrgMembershipRole } from "@app/db/schemas";
import { ActorContextMemo, roleHolderOf, TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import {
  Permission,
  RuleIdentity,
  TActorGrantsService,
  TGrantActor,
  TRoleService
} from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { OrgPermission } from "../../models/org-permission";
import { Organization } from "../../models/organization";
import { OrgPermissionSet } from "../../models/permissions/org-permission-set";

export type TGetOrgPermissionInput = {
  actor: TActorContext;
  // Defaults to the actor's org; any other org gets refused.
  orgId?: string;
  // Rejects sub-orgs for parent-only ops and root orgs for child-only ones.
  scope?: OrganizationActionScope;
};

export type TOrgRolePermission = {
  permission: Permission<OrgPermissionSet>;
  // Only set for custom roles.
  role?: { id: string; name: string; slug: string; description?: string | null; permissions?: unknown };
};

export type TOrgPermissionService = {
  // Refuses another org, non-members, and the wrong org level.
  getOrgPermission(input: TGetOrgPermissionInput): Promise<OrgPermission>;
  // One permission per slug (built-ins as defined, custom ones from the org's roles). Throws on an unknown slug
  // unless ignoreUnresolvedRoles is set.
  getOrgPermissionByRoles(input: {
    orgId: string;
    roles: string[];
    ignoreUnresolvedRoles?: boolean;
  }): Promise<TOrgRolePermission[]>;
  // One permission per active org role/privilege the actor holds. The name fills `{{identity.*}}` placeholders.
  getGrantPermissions(input: {
    actor: TGrantActor & { name: string };
    orgId: string;
  }): Promise<Permission<OrgPermissionSet>[]>;
  // Checked against the user's full root org roles.
  canBypassSso(input: { userId: string; rootOrgId: string }): Promise<boolean>;
};

export class OrgPermissionService implements TOrgPermissionService {
  constructor(
    private readonly actorGrantsService: TActorGrantsService,
    private readonly roleService: TRoleService,
    private readonly memo: ActorContextMemo<OrgPermission>
  ) {}

  async getOrgPermission({
    actor,
    orgId = actor.org.id,
    scope = OrganizationActionScope.Any
  }: TGetOrgPermissionInput): Promise<OrgPermission> {
    const { principal } = actor;
    const holder = roleHolderOf(principal);
    if (orgId !== actor.org.id) {
      throw new PermissionDeniedError({
        message: `Your token is scoped to organization with ID ${actor.org.id}, but this resource belongs to a different organization.`
      });
    }

    return this.memo.getOrCompute(actor, `${orgId}:${scope}`, async () => {
      const grants = await this.actorGrantsService.getActorGrants({
        actor: holder,
        scope: { scope: AccessScope.Organization, orgId }
      });
      if (!grants.hasMembership) {
        throw new PermissionDeniedError({
          message: `You are not a member of this organization with ID ${orgId}. Please assign this ${holder.type} to the organization with the appropriate permissions, then try again.`
        });
      }
      Organization.fromActorOrg(actor.org).assertLevel(scope);
      return OrgPermission.fromGrants({
        grants,
        principal,
        usesNewPrivilegeSystem: actor.org.shouldUseNewPrivilegeSystem
      });
    });
  }

  async getOrgPermissionByRoles({
    orgId,
    roles,
    ignoreUnresolvedRoles = false
  }: {
    orgId: string;
    roles: string[];
    ignoreUnresolvedRoles?: boolean;
  }): Promise<TOrgRolePermission[]> {
    // "custom" is listed as built in so it resolves to no rules, not to a custom role with that slug.
    const resolved = await this.roleService.resolveRoles({
      owner: { orgId },
      slugs: roles,
      builtInSlugs: Object.values(OrgMembershipRole),
      ignoreUnresolvedRoles
    });
    return resolved.map(({ grant, role }) => ({
      permission: OrgPermission.forGrant({ grant }),
      ...(role && { role: role.toJSON() })
    }));
  }

  async getGrantPermissions({
    actor,
    orgId
  }: {
    actor: TGrantActor & { name: string };
    orgId: string;
  }): Promise<Permission<OrgPermissionSet>[]> {
    const grants = await this.actorGrantsService.getActorGrants({
      actor: { type: actor.type, id: actor.id },
      scope: { scope: AccessScope.Organization, orgId }
    });
    const identity = RuleIdentity.create({ id: actor.id, username: actor.name, metadata: grants.attributeMap() });
    return grants
      .distinctActiveGrants({ grantsNothing: [OrgMembershipRole.NoAccess] })
      .map((grant) => OrgPermission.forGrant({ grant, identity }));
  }

  async canBypassSso({ userId, rootOrgId }: { userId: string; rootOrgId: string }): Promise<boolean> {
    const grants = await this.actorGrantsService.getActorGrants({
      actor: { type: ActorType.USER, id: userId },
      scope: { scope: AccessScope.Organization, orgId: rootOrgId }
    });
    if (!grants.hasMembership) return false;
    return OrgPermission.grantsSsoBypass(grants);
  }
}
