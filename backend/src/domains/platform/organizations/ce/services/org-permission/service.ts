import { AccessScope, OrganizationActionScope } from "@app/db/schemas";
import { ActorContextMemo, TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError, RuleViolationError, EntityNotFoundError } from "@app/domains/lib/errors";
import {
  Grant,
  Permission,
  RuleIdentity,
  TActorGrantsService,
  TGrantActor,
  TRoleService
} from "@app/domains/platform/access-control/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { OrgPermission } from "../../models/org-permission";
import { OrgPermissionSet } from "../../models/org-permission-set";
import { OrgRoles } from "../../models/org-roles";
import { Organization } from "../../models/organization";

export type TGetOrgPermissionInput = {
  actor: TActorContext;
  // Defaults to the actor's org; any other org is refused.
  orgId?: string;
  // Refuses a sub-org for parent-only operations, and a root org for child-only ones.
  scope?: OrganizationActionScope;
};

export type TOrgRolePermission = {
  permission: Permission<OrgPermissionSet>;
  // The custom role; absent for a built-in slug.
  role?: { id: string; name: string; slug: string; description?: string | null; permissions?: unknown };
};

export type TOrgPermissionService = {
  // What the actor may do in its org. Refuses another org, a non-member, and the wrong org level.
  getOrgPermission(input: TGetOrgPermissionInput): Promise<OrgPermission>;
  // Each slug as a permission of its own: built-in slugs as defined, custom slugs from the org's custom roles.
  // Refuses a slug with no role unless told to skip it.
  getOrgPermissionByRoles(input: {
    orgId: string;
    roles: string[];
    ignoreUnresolvedRoles?: boolean;
  }): Promise<TOrgRolePermission[]>;
  // Each active org role and privilege another user or identity holds, as a permission of its own with its
  // `{{identity.*}}` placeholders filled in. The caller passes the actor's name.
  getGrantPermissions(input: {
    actor: TGrantActor & { name: string };
    orgId: string;
  }): Promise<Permission<OrgPermissionSet>[]>;
  // Whether the user's root org roles let it through the root org's SSO enforcement, on its full roles.
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
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      throw new RuleViolationError({ message: "Invalid actor provided", name: "Get org permission" });
    }
    if (orgId !== actor.org.id) {
      throw new PermissionDeniedError({
        message: `Your token is scoped to organization with ID ${actor.org.id}, but this resource belongs to a different organization.`
      });
    }

    return this.memo.getOrCompute(actor, `${orgId}:${scope}`, async () => {
      const grants = await this.actorGrantsService.getActorGrants({
        actor: { type: principal.type, id: principal.id },
        scope: { scope: AccessScope.Organization, orgId }
      });
      if (!grants.hasMembership) {
        throw new PermissionDeniedError({
          message: `You are not a member of this organization with ID ${orgId}. Please assign this ${principal.type} to the organization with the appropriate permissions, then try again.`
        });
      }
      Organization.fromActorOrg(actor.org).assertLevel(scope);
      return OrgPermission.fromGrants({ grants, principal });
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
    const customSlugs = roles.filter((slug) => !OrgRoles.isBuiltIn(slug));
    const customRoles = await this.roleService.findRolesBySlugs({ owner: { orgId }, slugs: customSlugs });
    const bySlug = new Map(customRoles.map((role) => [role.slug, role]));
    const missing = customSlugs.filter((slug) => !bySlug.has(slug));
    if (missing.length && !ignoreUnresolvedRoles) {
      throw new EntityNotFoundError({
        message: `Specified roles '${missing.join(",")}' was not found in the organization with ID '${orgId}'`
      });
    }
    return roles.flatMap((slug): TOrgRolePermission[] => {
      if (OrgRoles.isBuiltIn(slug)) return [{ permission: OrgPermission.forGrant({ grant: Grant.restore({ slug }) }) }];
      const role = bySlug.get(slug);
      if (!role) return [];
      return [{ permission: OrgPermission.forGrant({ grant: role.toGrant() }), role: role.toJSON() }];
    });
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
    return grants.distinctActiveGrants().map((grant) => OrgPermission.forGrant({ grant, identity }));
  }

  async canBypassSso({ userId, rootOrgId }: { userId: string; rootOrgId: string }): Promise<boolean> {
    const grants = await this.actorGrantsService.getActorGrants({
      actor: { type: ActorType.USER, id: userId },
      scope: { scope: AccessScope.Organization, orgId: rootOrgId }
    });
    if (!grants.hasMembership) return false;
    return OrgPermission.fromGrants({ grants }).canBypassSso();
  }
}
