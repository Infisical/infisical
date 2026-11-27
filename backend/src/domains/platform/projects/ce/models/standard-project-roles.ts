import { ProjectType } from "@app/db/schemas";
import { Grant, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { logger } from "@app/lib/logger";

import { ProjectPermissionSet } from "./permissions/project-permission-set";
import { genericProjectRoles } from "./permissions/project-roles";

export type TProjectRule = TPermissionRule<ProjectPermissionSet>;

// Only products whose roles differ from the standard ones implement this; domains.ts hands them to Projects.
export type TProjectRoles = {
  readonly projectType: ProjectType;
  rulesFor(grant: Grant): TProjectRule[];
};

// An unknown slug (say, a removed product's role) grants nothing instead of throwing, so the actor's other roles
// keep working.
export class StandardProjectRoles implements TProjectRoles {
  constructor(
    readonly projectType: ProjectType,
    private readonly builtInRoles: Record<string, TProjectRule[]>
  ) {}

  static generic(projectType: ProjectType): StandardProjectRoles {
    return new StandardProjectRoles(projectType, genericProjectRoles);
  }

  rulesFor(grant: Grant): TProjectRule[] {
    if (grant.isCustom()) return grant.customRules<TProjectRule>();
    const slug = grant.builtInSlug() as string;
    if (Object.hasOwn(this.builtInRoles, slug)) return this.builtInRoles[slug];
    // Only the server sets up the logger, tests and scripts run without it.
    logger?.warn(
      `Projects: unknown project role slug, granting no rules [role=${slug}] [projectType=${this.projectType}]`
    );
    return [];
  }
}
