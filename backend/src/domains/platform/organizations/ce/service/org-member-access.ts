import { MongoAbility } from "@casl/ability";

import { AccessScope, OrgMembershipRole } from "@app/db/schemas";
import {
  buildRules,
  escapeHandlebarsMissingDict,
  interpolateStoredIdentityRules,
  Permission,
  TAccessControlDomain,
  TGrantActor,
  TGrantEntry
} from "@app/domains/platform/access-control/ce/module";
import { NotFoundError } from "@app/lib/errors";

import { ORG_ROLES } from "./org-roles";
import { OrgPermissionSet } from "./permission/org-permission";

export type TOrgRolePermission = {
  permission: Permission<OrgPermissionSet>;
  // The custom role; absent for a built-in slug.
  role?: { id: string; name: string; slug: string; description?: string | null; permissions?: unknown };
};

export type TOrgMemberAccessDeps = {
  accessControlDomain: Pick<TAccessControlDomain, "fetchGrants" | "findRolesBySlugs">;
};

const orgRules = (entries: TGrantEntry[]) =>
  buildRules<MongoAbility<OrgPermissionSet>>({
    entries,
    customRoleSlug: OrgMembershipRole.Custom,
    resolveRole: (role) => ORG_ROLES[role],
    onUnknownRole: (role) =>
      new NotFoundError({ name: "OrgRoleInvalid", message: `Organization role '${role}' not found` })
  });

// Org permissions built from roles and grants rather than for the actor making the request: a role set to compare an
// actor's privileges against, and each grant of another member. Callers check that the request may see them.
export class OrgMemberAccess {
  constructor(private readonly deps: TOrgMemberAccessDeps) {}

  // Each slug as a permission of its own: built-in slugs as defined, custom slugs from the org's custom roles.
  // Refuses a slug with no role unless told to skip it.
  async getOrgPermissionByRoles({
    orgId,
    roles,
    ignoreUnresolvedRoles = false
  }: {
    orgId: string;
    roles: string[];
    ignoreUnresolvedRoles?: boolean;
  }): Promise<TOrgRolePermission[]> {
    const isBuiltIn = (slug: string) => Object.values(OrgMembershipRole).includes(slug as OrgMembershipRole);
    const customSlugs = roles.filter((slug) => !isBuiltIn(slug));
    const customRoles = await this.deps.accessControlDomain.findRolesBySlugs({ owner: { orgId }, slugs: customSlugs });
    const bySlug = new Map(customRoles.map((role) => [role.slug, role]));
    const missing = customSlugs.filter((slug) => !bySlug.has(slug));
    if (missing.length && !ignoreUnresolvedRoles) {
      throw new NotFoundError({
        message: `Specified roles '${missing.join(",")}' was not found in the organization with ID '${orgId}'`
      });
    }
    return roles.flatMap((slug): TOrgRolePermission[] => {
      if (isBuiltIn(slug)) return [{ permission: Permission.fromRules({ rules: orgRules([{ role: slug }]) }) }];
      const role = bySlug.get(slug);
      if (!role) return [];
      return [
        {
          permission: Permission.fromRules({
            rules: orgRules([{ role: OrgMembershipRole.Custom, permissions: role.permissions || [] }])
          }),
          role: role.toJSON()
        }
      ];
    });
  }

  // Each active org role and org privilege another user or identity holds, as a permission of its own with its
  // `{{identity.*}}` placeholders filled in. The caller passes the actor's name.
  async getGrantPermissions({
    actor,
    orgId
  }: {
    actor: TGrantActor & { name: string };
    orgId: string;
  }): Promise<Permission<OrgPermissionSet>[]> {
    const grants = await this.deps.accessControlDomain.fetchGrants({
      actor: { type: actor.type, id: actor.id },
      scope: { scope: AccessScope.Organization, orgId }
    });
    const identity = {
      id: actor.id,
      username: actor.name,
      metadata: escapeHandlebarsMissingDict(grants.attributeMap(), "identity.metadata")
    };
    return grants
      .activeEntries(OrgMembershipRole.Custom)
      .map((entry) => Permission.fromRules({ rules: interpolateStoredIdentityRules(orgRules([entry]), { identity }) }));
  }
}
