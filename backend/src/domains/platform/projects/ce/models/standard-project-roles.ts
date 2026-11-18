import { ProjectType } from "@app/db/schemas";
import { Grant, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { logger } from "@app/lib/logger";

import { ProjectPermissionSet } from "./project-permission-set";
import { genericProjectRoles } from "./project-roles";

export type TProjectRule = TPermissionRule<ProjectPermissionSet>;

// What the roles held in one product's projects grant. A product implements it when its roles differ from the
// standard ones, and domains.ts passes it to Projects.
export type TProjectRoles = {
  readonly projectType: ProjectType;
  rulesFor(grant: Grant): TProjectRule[];
};

// Built-in slugs get their rules, a custom role or privilege applies as the customer wrote it, and an unknown slug
// (a removed product's role) grants nothing, so the actor's other roles keep working.
export class StandardProjectRoles implements TProjectRoles {
  constructor(
    readonly projectType: ProjectType,
    private readonly builtInRoles: Record<string, TProjectRule[]>
  ) {}

  // The generic admin, member, viewer and no-access roles.
  static generic(projectType: ProjectType): StandardProjectRoles {
    return new StandardProjectRoles(projectType, genericProjectRoles);
  }

  rulesFor(grant: Grant): TProjectRule[] {
    if (grant.isCustom()) return grant.customRules<TProjectRule>();
    const slug = grant.builtInSlug() as string;
    if (Object.hasOwn(this.builtInRoles, slug)) return this.builtInRoles[slug];
    // The logger is only initialised by the server; tests and scripts run without it.
    logger?.warn(
      `Projects: unknown project role slug, granting no rules [role=${slug}] [projectType=${this.projectType}]`
    );
    return [];
  }
}
