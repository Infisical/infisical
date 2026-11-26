import { EntityNotFoundError } from "@app/domains/lib/errors";

import { Grant } from "../../models/grant";
import { Role } from "../../models/role";
import { TGrantStore, TRoleOwner } from "../dependencies";

// Built-in slugs resolve to themselves (no role), custom slugs carry their role.
export type TResolvedRole = { slug: string; grant: Grant; role?: Role };

export type TResolveRolesInput = {
  owner: TRoleOwner;
  slugs: string[];
  // Any slug not in here is treated as a custom role slug.
  builtInSlugs: readonly string[];
  // Drop custom slugs with no role instead of throwing.
  ignoreUnresolvedRoles?: boolean;
};

export type TRoleService = {
  // Keeps slug order. Throws on a custom slug with no role unless ignoreUnresolvedRoles is set.
  resolveRoles(input: TResolveRolesInput): Promise<TResolvedRole[]>;
};

const ownerLabel = (owner: TRoleOwner) =>
  "orgId" in owner ? `organization with ID '${owner.orgId}'` : `project with ID '${owner.projectId}'`;

export class RoleService implements TRoleService {
  constructor(private readonly grantStore: TGrantStore) {}

  async resolveRoles({
    owner,
    slugs,
    builtInSlugs,
    ignoreUnresolvedRoles = false
  }: TResolveRolesInput): Promise<TResolvedRole[]> {
    const builtIn = new Set(builtInSlugs);
    const customSlugs = slugs.filter((slug) => !builtIn.has(slug));
    const customRoles = customSlugs.length ? await this.grantStore.findRolesBySlugs({ owner, slugs: customSlugs }) : [];
    const bySlug = new Map(customRoles.map((role) => [role.slug, role]));
    const missing = customSlugs.filter((slug) => !bySlug.has(slug));
    if (missing.length && !ignoreUnresolvedRoles) {
      throw new EntityNotFoundError({
        message: `Specified roles '${missing.join(",")}' was not found in the ${ownerLabel(owner)}`
      });
    }
    return slugs.flatMap((slug): TResolvedRole[] => {
      if (builtIn.has(slug)) return [{ slug, grant: Grant.restore({ slug }) }];
      const role = bySlug.get(slug);
      return role ? [{ slug, grant: role.toGrant(), role }] : [];
    });
  }
}
